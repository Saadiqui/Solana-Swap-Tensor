import React, {useEffect, useState} from 'react';
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
import './App.css'; // Custom styles for improved UX

const SOL_MINT = "So11111111111111111111111111111111111111112";

function App() {
    const { publicKey, wallet, sendTransaction } = useWallet();
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
    const [loadingSwap, setLoadingSwap] = useState(false);

    const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=74354d81-106e-45b1-a611-0884434d6863');

    const getTokenBalance = (tokenAddress) => {
        const token = tokens.find((t) => t.address === tokenAddress);
        return token ? token.balance : 0;
    };

    class TokenInfo {
        constructor(name, symbol, mintAddress, decimals) {
            this.name = name;
            this.symbol = symbol;
            this.mintAddress = mintAddress;
            this.decimals = decimals;
        }
    }

    async function getTokenInformation(mintAccount) {
        const response = await fetch(
            `https://tokens.jup.ag/token/${mintAccount}`
        );

        const data = await response.json();

        if (data) {
            return new TokenInfo(data.name, data.symbol, data.address, data.decimals)
        } else {
            return new TokenInfo("Unknown", "UNK", "", 9)
        }
    }

    useEffect(() => {
        if (publicKey) {
            setLoadingUserWalletTokens(true);

            const fetchTokens = async () => {
                try {
                    const solBalance = await connection.getBalance(publicKey);
                    const formattedSolBalance = solBalance / LAMPORTS_PER_SOL;

                    // TODO: UNSURE IF WE CAN FILTER OUT SPAM TOKENS SOMEHOW
                    const mainTokenProgramAccounts = await connection.getParsedTokenAccountsByOwner(
                        publicKey,
                        { programId: TOKEN_PROGRAM_ID }
                    );

                    const mainTokenProgramUserTokens = mainTokenProgramAccounts.value.map((tokenAccount) => {
                        const accountInfo = tokenAccount.account.data.parsed.info;
                        const tokenAddress = accountInfo.mint;
                        const tokenBalance = accountInfo.tokenAmount.uiAmount;
                        const tokenSymbol = tokenAddress.symbol === undefined ? "Unknown" : tokenAddress.symbol

                        return { address: tokenAddress, symbol: tokenSymbol, balance: tokenBalance };
                    });

                    const token2022ProgramAccounts = await connection.getParsedTokenAccountsByOwner(
                        publicKey,
                        { programId: TOKEN_2022_PROGRAM_ID }
                    );

                    console.log("token2022ProgramAccounts: ", token2022ProgramAccounts)
                    const token2022ProgramUserTokens = await Promise.all(
                        token2022ProgramAccounts.value.map(async (tokenAccount) => {
                            const accountInfo = tokenAccount.account.data.parsed.info;
                            const tokenBalance = accountInfo.tokenAmount.uiAmount;
                            const tokenInfo = await getTokenInformation(accountInfo.mint);
                            console.log("tokenInfo", tokenInfo);
                            console.log(`tokenInfo.mintAddress: ${tokenInfo.mintAddress}, tokenInfo.symbol: ${tokenInfo.symbol}, tokenBalance: ${tokenBalance}`);

                            return { address: tokenInfo.mintAddress, symbol: tokenInfo.symbol, balance: tokenBalance };
                        })
                    );

                    console.log(`This is token2022 after the mapping!!!!!!: ${JSON.stringify(token2022ProgramAccounts)}`)

                    const combinedTokens = [
                        // TODO: CAN WE GET AWAY WITHOUT HARDCODING SOL?
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
                    const inputAmount = fromToken === SOL_MINT ? swapAmount * LAMPORTS_PER_SOL : swapAmount;

                    console.log(`fromToken: ${fromToken}, toToken: ${toToken}, swapAmount: ${swapAmount}, inputAmount: ${inputAmount}`)

                    // TODO: SUPPORT CASE WHERE AMOUNT TO SWAP IS TOO SMALL OR OTHERWISE CANNOT BE SUPPORTED
                    // TODO: SUPPORT SHOWING THE TARGET AMOUNT IN THE DECIMALIZATION OF THE TARGET TOKEN. E.G. PYUSD ONLY SUPPORTS 6 PLACES
                    const response = await fetch(
                        `https://quote-api.jup.ag/v6/quote?inputMint=${fromToken}&outputMint=${toToken}&amount=${inputAmount}&slippageBps=50`
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

    // Function to get the associated token address for the selected mint
    async function getTokenAccount(mint, walletPublicKey) {
        if (!mint || !walletPublicKey) {
            console.error("Mint or walletPublicKey is undefined:", { mint, walletPublicKey });
            return;
        }

        return await getAssociatedTokenAddress(
            mint,
            walletPublicKey,
            true, // This parameter specifies whether the account is owned by the wallet
            TOKEN_2022_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
    }

    // Function to fetch swap info from Jupiter
    async function fetchSwapInfo(inputMint, outputMint, amount) {
        const response = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`);
        const data = await response.json();
        return {
            inAmount: data.inAmount,
            otherAmountThreshold: data.otherAmountThreshold,
            quoteResponse: data
        };
    }

    // Function to fetch the swap transaction from Jupiter
    async function fetchSwapTransaction(walletPublicKey, tokenAccount, swapInfo) {
        const requestBody = {
            userPublicKey: walletPublicKey.toBase58(),
            wrapAndUnwrapSol: true,
            useSharedAccounts: true,
            feeAccount: walletPublicKey.toBase58(),
            trackingAccount: walletPublicKey.toBase58(),
            prioritizationFeeLamports: 0,  // No prioritization fee in this case
            asLegacyTransaction: false,
            useTokenLedger: false,
            destinationTokenAccount: tokenAccount.toBase58(),
            dynamicComputeUnitLimit: true,
            skipUserAccountsRpcCalls: true,
            quoteResponse: swapInfo.quoteResponse
        };
        console.log("fetch swap request:", { requestBody });

        const response = await fetch('https://quote-api.jup.ag/v6/swap', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        // console.log("response.json():", response.json())
        const data = await response.json();
        console.log('Raw response data:', data);

        const swapTransaction = data.swapTransaction
        const lastValidBlockHeight = data.lastValidBlockHeight
        // const { swapTransaction, lastValidBlockHeight } = await response.json();
        // console.log(`swapTransaction: ${swapTransaction}, lastValidBlockHeight: ${lastValidBlockHeight}`)
        return { swapTransaction, lastValidBlockHeight };
    }

    // // Function to send the transaction using the wallet adapter
    // async function sendTransaction(swapTransaction, wallet, connection, lastValidBlockHeight) {
    //     const versionedMessage = VersionedMessage.deserialize(Buffer.from(swapTransaction, 'base64'));
    //     const transaction = new VersionedTransaction(versionedMessage);
    //
    //     // Sign and send the transaction using the wallet adapter
    //     const signature = await wallet.sendTransaction(transaction, connection);
    //
    //     // Confirm the transaction
    //     await connection.confirmTransaction({
    //         signature,
    //         blockhash: transaction.recentBlockhash,
    //         lastValidBlockHeight
    //     }, "finalized");
    //
    //     console.log("Transaction confirmed:", signature);
    // }

    const ensureAssociatedTokenAccountExists = async (mint, owner, connection) => {
        const associatedTokenAddress = await getAssociatedTokenAddress(
            mint,
            owner,
            true, // Indicating this is a Token-2022 account (for wrap/unwrap SOL cases)
            TOKEN_2022_PROGRAM_ID, // Use the Token-2022 program ID
            ASSOCIATED_TOKEN_PROGRAM_ID // The standard associated token program ID
        );

        // Check if the account already exists
        const accountInfo = await connection.getAccountInfo(associatedTokenAddress);

        if (!accountInfo) {
            console.log("Need to create new associated token account as it doesn't exist");
            try {
                // Account doesn't exist, create it
                const transaction = new Transaction().add(
                    createAssociatedTokenAccountInstruction(
                        owner, // Payer (the wallet)
                        associatedTokenAddress, // The address of the associated token account
                        owner, // The owner of the account
                        mint, // The token mint
                        // TODO: SUPPORT BOTH REGULAR TOKEN PROGRAM AND TOKEN2022 PROGRAM ID HERE BASED ON TOKEN
                        TOKEN_2022_PROGRAM_ID, // Token-2022 program ID
                        ASSOCIATED_TOKEN_PROGRAM_ID // Standard associated token program ID
                    )
                );

                // Set the fee payer
                transaction.feePayer = owner;
                transaction.recentBlockhash = await connection.getLatestBlockhash().lastValidBlockHeight

                // Optional: Simulate the transaction first to catch any potential errors
                const simulation = await connection.simulateTransaction(transaction);
                if (simulation.value.err) {
                    console.error("Simulation failed:", simulation.value.err);
                    throw new Error("Simulation failed. Cannot create associated token account.");
                }

                // Send the transaction to create the associated token account
                const signature = await sendTransaction(transaction, connection);

                // Confirm the transaction with higher commitment
                await connection.confirmTransaction(signature, 'finalized');

                console.log("Created associated token account:", associatedTokenAddress.toBase58());
            } catch (error) {
                console.error("Failed to create associated token account:", error);
                throw error;
            }
        } else {
            console.log("Associated token account already exists:", associatedTokenAddress.toBase58());
        }

        return associatedTokenAddress;
    };

    // Function to handle the swap in your app
    const handleSwap = async (inputMint, outputMint, amount) => {
        if (!publicKey) {
            console.error("No wallet connected");
            return;
        }

        inputMint = fromToken;
        // TODO: TEST WITH SOURCE TOKENS OTHER THAN SOL
        // TODO: TEST WITH TARGET TOKEN THAT IS SOL
        amount = inputMint === SOL_MINT ? amount * LAMPORTS_PER_SOL : amount

        console.log(`inputMint=${inputMint}, outputMint=${outputMint}, amount=${amount}`)

        try {
            // Get the user's token account for the output mint
            // Ensure the associated token account exists for the output token
            const tokenAccount = await ensureAssociatedTokenAccountExists(outputMint, publicKey, connection);
            console.log(`User token account for output: ${tokenAccount.toString()}`);

            // Step 1: Fetch swap info from Jupiter
            const swapInfo = await fetchSwapInfo(inputMint, outputMint, amount);
            console.log("swapInfo", swapInfo)

            const quoteResponse = swapInfo.quoteResponse

            console.log(`publicKey: ${publicKey}`)
            console.log("quoteResponse:", quoteResponse)

            const { swapTransaction } = await (
                await fetch('https://quote-api.jup.ag/v6/swap', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        // quoteResponse from /quote api
                        quoteResponse,
                        // user public key to be used for the swap
                        userPublicKey: publicKey.toString(),
                        // auto wrap and unwrap SOL. default is true
                        wrapAndUnwrapSol: true,
                        // feeAccount is optional. Use if you want to charge a fee.  feeBps must have been passed in /quote API.
                        // feeAccount: "fee_account_public_key"
                    })
                })
            ).json();

            const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
            var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
            const latestBlockHash = await connection.getLatestBlockhash();
            transaction.recentBlockhash = latestBlockHash.blockhash;
            transaction.feePayer = publicKey; // Set the fee payer to the connected wallet

            // Log the transaction details for debugging
            console.log("Transaction Details:", transaction);


            // TODO: CLEANUP SIMULATION
            // Simulate the transaction first to catch any issues
            const simulation = await connection.simulateTransaction(transaction);
            if (simulation.value.err) {
                console.error("Simulation failed:", simulation.value.err);
                return;
            }

            console.log("transaction successfully simulated")

            // Use sendTransaction from the wallet adapter
            const signature = await sendTransaction(transaction, connection);

            console.log("transaction signed and broadcast")

            // Confirm the transaction
            // Using 'finalized' commitment to ensure the transaction is fully confirmed
            // Reference: https://solana.com/docs/core/transactions#confirmation
            const confirmation = await connection.confirmTransaction({
                signature,
                blockhash: latestBlockHash.blockhash,
                lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
            }, "finalized");

            if (confirmation.value.err) {
                throw new Error(`Transaction not confirmed: ${confirmation.value.err.toString()}`);
            }

            console.log("Confirmed: ", signature);

            // console.log("Transaction confirmed:", signature);
        } catch (error) {
            console.error('Error performing swap:', error);
            setError('Failed to complete the swap.');
        } finally {
            setLoadingSwap(false);
        }
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
                                            {token.symbol} - Balance: {token.balance}
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
                    {error && <p style={{color: 'red'}}>{error}</p>}
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
                        // TODO: The input mint should be a token address, not just a token name (e.g. SOL)
                        onClick={() => handleSwap(fromToken, new PublicKey(toToken), swapAmount)} // Use an inline function to pass arguments
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

export default App;
