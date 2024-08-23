import React, {useCallback, useEffect, useState} from 'react';
import {Connection, LAMPORTS_PER_SOL, PublicKey, Transaction, VersionedTransaction} from '@solana/web3.js';
import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountInstruction,
    getAssociatedTokenAddress,
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import {useWallet} from '@solana/wallet-adapter-react';
import {WalletMultiButton} from '@solana/wallet-adapter-react-ui';
import * as utils from './utils.js';
import * as outboundCallsUtils from './outboundCallsUtils.js'
import './App.css';

const SOL_MINT = "So11111111111111111111111111111111111111112";
const HELIUS_API_KEY = "74354d81-106e-45b1-a611-0884434d6863"

function App() {
    const { publicKey, sendTransaction } = useWallet();
    const [tokens, setTokens] = useState([]);
    const [availableTokens, setAvailableTokens] = useState([]);
    const [loadingUserWalletTokens, setLoadingUserWalletTokens] = useState(false);
    const [loadingTradeableTokens, setLoadingTradeableTokens] = useState(false);
    const [loadingSwapQuote, setLoadingSwapQuote] = useState(false);
    const [fromToken, setFromToken] = useState('');
    const [toToken, setToToken] = useState('');
    const [swapAmount, setSwapAmount] = useState('');
    const [expectedOutput, setExpectedOutput] = useState('');
    const [fees, setFees] = useState(null);
    const [error, setError] = useState('');
    const [loadingSwap, setLoadingSwap] = useState(false);

    const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`);

    const fetchTokens = useCallback( async () => {
        try {
            setLoadingUserWalletTokens(true);
            const solBalance = await connection.getBalance(publicKey);
            const formattedSolBalance = solBalance / LAMPORTS_PER_SOL;

            const mainTokenProgramUserTokens = await utils.FetchUserWalletTokens(publicKey, connection, TOKEN_PROGRAM_ID);
            const token2022ProgramUserTokens = await utils.FetchUserWalletTokens(publicKey, connection, TOKEN_2022_PROGRAM_ID);

            const combinedTokens = [
                { address: SOL_MINT, symbol: 'SOL', balance: formattedSolBalance },
                ...mainTokenProgramUserTokens,
                ...token2022ProgramUserTokens,
            ];

            setTokens(combinedTokens);
        } catch (error) {
            console.error('Error fetching user\'s tokens:', error);
        } finally {
            setLoadingUserWalletTokens(false);
        }
    }, [publicKey]);

    useEffect(() => {
        if (publicKey) {
            fetchTokens();
        }
    }, [publicKey]);

    useEffect(() => {
        const fetchTokenList = async () => {
            try {
                // we cache the token info list locally because it's a large list to fetch the first time
                const cachedTokens = localStorage.getItem('tradableTokens');
                if (cachedTokens) {
                    setAvailableTokens(JSON.parse(cachedTokens));
                    setLoadingTradeableTokens(false);
                    return;
                }

                const response = await fetch('https://tokens.jup.ag/tokens?tags=community');
                const data = await response.json();

                localStorage.setItem('tradableTokens', JSON.stringify(data));
                setAvailableTokens(data);
            } catch (error) {
                console.error('Error fetching tradable tokens:', error);
            } finally {
                setLoadingTradeableTokens(false);
            }
        };

        fetchTokenList();
    }, []);

    useEffect(() => {
        const fetchSwapQuote = async () => {
            if (fromToken && toToken && swapAmount) {
                try {
                    setLoadingSwapQuote(true)
                    const inputAmount = await utils.ConvertTokenAmountToUnits(fromToken, swapAmount)
                    // TODO: WAIT FOR USER TO STOP UPDATING THE INPUT TEXT BOX FOR HALF A SECOND BEFORE CALCULATING TO AVOID RE-CALCULATIONS WHILE TYPING
                    const response = await fetch(
                        `https://quote-api.jup.ag/v6/quote?inputMint=${fromToken}&outputMint=${toToken}&amount=${inputAmount}&slippageBps=50`
                    );

                    const data = await response.json();

                    if (data) {
                        const outAmount = await utils.ConvertUnitsToTokenAmount(toToken, data.outAmount)
                        setExpectedOutput(outAmount);

                        if (data.error !== undefined) {
                            console.error('Error fetching swap quote:', data.error);
                            setError("Error: " + data.error)
                        }

                        if (data.routePlan && data.routePlan.length > 0) {
                            const quote = data.routePlan[0].swapInfo;
                            const feeAmount = quote.feeAmount / LAMPORTS_PER_SOL;
                            const feeMint = quote.feeMint;
                            setFees({ amount: feeAmount, mint: feeMint });
                            setLoadingSwapQuote(false)
                        }
                    } else {
                        setExpectedOutput('');
                        setFees(null);
                    }
                } catch (error) {
                    console.error('Error fetching swap quote:', error);
                    setExpectedOutput('');
                    setFees(null);
                }
            }
        };

        fetchSwapQuote();
    }, [fromToken, toToken, swapAmount]);

    useEffect(() => {
        const validateAmount = () => {
            setError('');
            const balance = utils.GetTokenBalance(tokens, fromToken);
            const totalRequired = parseFloat(swapAmount) + (fees ? fees.amount : 0);

            if (parseFloat(swapAmount) > balance) {
                setError('Insufficient balance for the swap.');
            } else if (totalRequired > balance) {
                setError('Not enough funds to cover the swap and fees.');
            }
        };

        if (fromToken && swapAmount) {
            validateAmount();
        }
    }, [fromToken, swapAmount, fees]);

    async function handleSwap(inputMint, outputMint, amount) {
        if (!publicKey) {
            console.error("No wallet connected");
            return;
        }

        inputMint = fromToken;
        amount = await utils.ConvertTokenAmountToUnits(inputMint, amount)

        try {
            await outboundCallsUtils.EnsureAssociatedTokenAccountExists(outputMint, publicKey, connection, sendTransaction);

            // Fetch swap info from Jupiter
            const swapInfo = await outboundCallsUtils.FetchSwapInfo(inputMint, outputMint, amount);
            const quoteResponse = swapInfo.quoteResponse

            const swapTransaction = await outboundCallsUtils.fetchSwapTransaction(quoteResponse, publicKey)

            const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
            var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
            const latestBlockHash = await connection.getLatestBlockhash();
            transaction.recentBlockhash = latestBlockHash.blockhash;
            transaction.feePayer = publicKey;

            // Simulate the transaction first to catch any issues
            const simulation = await connection.simulateTransaction(transaction);
            if (simulation.value.err) {
                console.error("Simulation failed:", simulation.value.err);
                return;
            }

            // Use sendTransaction from the wallet adapter
            const signature = await sendTransaction(transaction, connection);

            // Confirm the transaction
            // Using 'finalized' commitment to ensure the transaction is fully confirmed
            const confirmation = await connection.confirmTransaction({
                signature,
                blockhash: latestBlockHash.blockhash,
                lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
            }, "finalized");

            alert(`Transaction ${signature} is confirmed!`)

            if (confirmation.value.err) {
                const txDetails = await connection.getTransaction(signature, { commitment: "confirmed" });
                console.error("Transaction logs:", txDetails.meta.logMessages);
                throw new Error(`Transaction not confirmed: ${JSON.stringify(confirmation.value.err)}. Logs: ${txDetails.meta.logMessages.join("\n")}`);
            }
        } catch (error) {
            console.error('Error performing swap:', error);
            setError('Failed to complete the swap.');
        } finally {
            setLoadingSwap(false);
            await fetchTokens();
        }
    }

    return (
        <div className="container">
            <h1>Solana Swap</h1>
            <WalletMultiButton />
            {publicKey && (
                <div className="trade-container">
                    {loadingUserWalletTokens ? (
                        <p>Loading tokens...</p>
                    ) : (
                        <div className="trade-row">
                            <div className="trade-item">
                                <input
                                    type="number"
                                    value={swapAmount}
                                    onChange={(e) => setSwapAmount(e.target.value)}
                                    placeholder="From amount"
                                    className="amount-input"
                                />
                                <select value={fromToken} onChange={(e) => setFromToken(e.target.value)}>
                                    <option value="" disabled>Select a token</option>
                                    {tokens.map((token, index) => (
                                        <option key={index} value={token.address}>
                                            {token.symbol} - Balance: {token.balance}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <span className="arrow">→</span>
                            <div className="trade-item">
                                <input
                                    type="text"
                                    value={loadingSwapQuote ? "Fetching Quote..." : expectedOutput}
                                    readOnly
                                    placeholder="Target amount"
                                    className="amount-input"
                                />
                                {loadingTradeableTokens ? (
                                    <p>Loading tokens...</p>
                                ) : (
                                    <select value={toToken} onChange={(e) => setToToken(e.target.value)}>
                                        <option value="" disabled>Select a token</option>
                                        {utils.FilteredToTokens(availableTokens, fromToken).map((token, index) => (
                                            <option key={index} value={token.address}>
                                                {token.symbol} ({token.name})
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>
                    )}
                    {error && <p style={{color: 'red'}}>{error}</p>}
                    {fees && (
                        <div className="fees">
                            <label>Fees:</label>
                            <div className="fees-display">
                                {fees.amount.toFixed(9)} {fees.mint === SOL_MINT ? 'SOL' : 'tokens'}
                            </div>
                        </div>
                    )}
                    <button
                        className="swap-button"
                        onClick={() => handleSwap(fromToken, new PublicKey(toToken), swapAmount)}
                        disabled={!fromToken || !toToken || !swapAmount || fromToken === toToken || error || loadingSwap}
                    >
                        {loadingSwap ? 'Processing...' : 'Swap'}
                    </button>
                    {fromToken === toToken && fromToken && (
                        <p style={{color: 'red'}}>From and To tokens cannot be the same.</p>
                    )}
                </div>
            )}
        </div>
    );
}

export { App as default, SOL_MINT };
