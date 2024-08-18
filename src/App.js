import React, { useState, useEffect } from 'react';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import './App.css'; // Custom styles for improved UX

const SOL_MINT = "So11111111111111111111111111111111111111112";

function App() {
    const { publicKey } = useWallet();
    const [tokens, setTokens] = useState([]);
    const [availableTokens, setAvailableTokens] = useState([]);
    const [loadingUserWalletTokens, setLoadingUserWalletTokens] = useState(false);
    const [loadingTradeableTokens, setLoadingTradeableTokens] = useState(false);
    const [fromToken, setFromToken] = useState('');
    const [toToken, setToToken] = useState('');
    const [swapAmount, setSwapAmount] = useState('');
    const [expectedOutput, setExpectedOutput] = useState('');
    const [fees, setFees] = useState(null);
    const [error, setError] = useState('');

    const getTokenBalance = (tokenAddress) => {
        const token = tokens.find((t) => t.address === tokenAddress);
        return token ? token.balance : 0;
    };

    useEffect(() => {
        if (publicKey) {
            setLoadingUserWalletTokens(true);
            const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=74354d81-106e-45b1-a611-0884434d6863');

            const fetchTokens = async () => {
                try {
                    const solBalance = await connection.getBalance(publicKey);
                    const formattedSolBalance = solBalance / LAMPORTS_PER_SOL;

                    // TODO: UNSURE IF WE CAN FILTER OUT SPAM TOKENS SOMEHOW
                    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
                        publicKey,
                        { programId: TOKEN_PROGRAM_ID }
                    );

                    const userTokens = tokenAccounts.value.map((tokenAccount) => {
                        const accountInfo = tokenAccount.account.data.parsed.info;
                        const tokenAddress = accountInfo.mint;
                        const tokenBalance = accountInfo.tokenAmount.uiAmount;

                        return { address: tokenAddress, balance: tokenBalance };
                    });

                    const combinedTokens = [
                        { address: 'SOL', balance: formattedSolBalance },
                        ...userTokens,
                    ];

                    setTokens(combinedTokens);
                } catch (error) {
                    console.error('Error fetching user\'s tokens:', error);
                } finally {
                    setLoadingUserWalletTokens(false);
                }
            };

            fetchTokens();
        }
    }, [publicKey]);

    useEffect(() => {
        const fetchTokenList = async () => {
            try {
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
                    const inputMint = fromToken === 'SOL' ? SOL_MINT : fromToken;
                    const outputMint = toToken === 'SOL' ? SOL_MINT : toToken;
                    const inputAmount = fromToken === 'SOL' ? swapAmount * LAMPORTS_PER_SOL : swapAmount;

                    // TODO: SUPPORT CASE WHERE AMOUNT TO SWAP IS TOO SMALL OR OTHERWISE CANNOT BE SUPPORTED
                    const response = await fetch(
                        `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${inputAmount}&slippageBps=50`
                    );

                    const data = await response.json();

                    if (data) {
                        const outAmount = (data.outAmount / LAMPORTS_PER_SOL).toFixed(9);
                        setExpectedOutput(outAmount);

                        if (data.routePlan && data.routePlan.length > 0) {
                            const quote = data.routePlan[0].swapInfo;
                            const feeAmount = quote.feeAmount / LAMPORTS_PER_SOL;
                            const feeMint = quote.feeMint;
                            setFees({ amount: feeAmount, mint: feeMint });
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
        // Validate the swap amount
        const validateAmount = () => {
            // TODO: VALIDATE THAT WE CAN AFFORD FEES WHEN SWAPPING THIS MUCH
            setError('');
            const balance = getTokenBalance(fromToken);
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

    const handleSwap = () => {
        console.log(`Swapping ${swapAmount} of ${fromToken} to ${toToken}`);
    };

    const filteredToTokens = availableTokens.filter(
        (token) => token.address !== fromToken
    );

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
                                            {token.address} - Balance: {token.balance}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <span className="arrow">→</span>
                            <div className="trade-item">
                                <input
                                    type="text"
                                    value={expectedOutput}
                                    readOnly
                                    placeholder="Target amount"
                                    className="amount-input"
                                />
                                {loadingTradeableTokens ? (
                                    <p>Loading tokens...</p>
                                ) : (
                                    <select value={toToken} onChange={(e) => setToToken(e.target.value)}>
                                        <option value="" disabled>Select a token</option>
                                        {filteredToTokens.map((token, index) => (
                                            <option key={index} value={token.address}>
                                                {token.symbol} ({token.name})
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>
                    )}
                    {error && <p style={{ color: 'red' }}>{error}</p>}
                    {fees && (
                        <div className="fees">
                            {/*TODO SUPPORT CASES WITH NO FEES FOUND*/}
                            <label>Fees:</label>
                            <div className="fees-display">
                                {fees.amount.toFixed(9)} {fees.mint === SOL_MINT ? 'SOL' : 'tokens'}
                            </div>
                        </div>
                    )}
                    <button
                        className="swap-button"
                        onClick={handleSwap}
                        disabled={!fromToken || !toToken || !swapAmount || fromToken === toToken || error}
                    >
                        Swap
                    </button>
                    {fromToken === toToken && fromToken && (
                        <p style={{ color: 'red' }}>From and To tokens cannot be the same.</p>
                    )}
                </div>
            )}
        </div>
    );
}

export default App;
