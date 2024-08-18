import React, { useState, useEffect } from 'react';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { TokenListProvider } from '@solana/spl-token-registry';

const SOL_MINT = "So11111111111111111111111111111111111111112";

function App() {
    const { publicKey } = useWallet();
    const [tokens, setTokens] = useState([]);
    const [availableTokens, setAvailableTokens] = useState([]); // All available tokens for the "To" field
    const [loadingUserWalletTokens, setLoadingUserWalletTokens] = useState(false);
    const [loadingTradeableTokens, setLoadingTradeableTokens] = useState(false);
    const [fromToken, setFromToken] = useState('');
    const [toToken, setToToken] = useState('');
    const [swapAmount, setSwapAmount] = useState('');
    const [expectedOutput, setExpectedOutput] = useState(null);
    const [fees, setFees] = useState(null);

    // load user wallet tokens
    useEffect(() => {
        if (publicKey) {
            setLoadingUserWalletTokens(true);
            const connection = new Connection('https://api.devnet.solana.com');

            const fetchTokens = async () => {
                try {
                    // Fetch SOL balance
                    const solBalance = await connection.getBalance(publicKey);
                    const formattedSolBalance = solBalance / LAMPORTS_PER_SOL;

                    // Fetch SPL tokens
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

                    // Add SOL as the first item
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

    // Fetch the full list of tokens for the "To" field
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

                // Cache the tokens locally
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

    // Fetch swap quote from Jupiter
    useEffect(() => {
        const fetchSwapQuote = async () => {
            if (fromToken && toToken && swapAmount) {
                try {
                    const inputMint = fromToken === 'SOL' ? SOL_MINT : fromToken;
                    const outputMint = toToken === 'SOL' ? SOL_MINT : toToken;
                    const inputAmount = fromToken === 'SOL' ? swapAmount * LAMPORTS_PER_SOL : swapAmount;

                    const response = await fetch(
                        `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${inputAmount}&slippageBps=50`
                    );

                    const data = await response.json();

                    if (data) {
                        const outAmount = data.outAmount / LAMPORTS_PER_SOL; // Convert back to SOL or token unit
                        setExpectedOutput(outAmount);

                        if (data.routePlan && data.routePlan.length > 0) {
                            const quote = data.routePlan[0].swapInfo;
                            const feeAmount = quote.feeAmount / LAMPORTS_PER_SOL; // Convert fees to SOL or token unit
                            const feeMint = quote.feeMint;
                            setFees({ amount: feeAmount, mint: feeMint });
                        }
                    } else {
                        setExpectedOutput(null);
                        setFees(null);
                    }
                } catch (error) {
                    console.error('Error fetching swap quote:', error);
                    setExpectedOutput(null);
                    setFees(null);
                }
            }
        };

        fetchSwapQuote();
    }, [fromToken, toToken, swapAmount]);

    const handleSwap = () => {
        console.log(`Swapping ${swapAmount} of ${fromToken} to ${toToken}`);
        // Placeholder for the swap logic
    };

    const filteredToTokens = availableTokens.filter(
        (token) => token.address !== fromToken
    );

    return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", flexDirection: "column" }}>
            <h1>Solana Swap</h1>
            <WalletMultiButton />
            {publicKey && (
                <div style={{ marginTop: '20px' }}>
                    {loadingUserWalletTokens ? (
                        <p>Loading tokens...</p>
                    ) : (
                        <>
                            <div>
                                <label>From: </label>
                                <select value={fromToken} onChange={(e) => setFromToken(e.target.value)}>
                                    <option value="" disabled>Select a token</option>
                                    {tokens.map((token, index) => (
                                        <option key={index} value={token.address}>
                                            {token.address} - Balance: {token.balance}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label>To: </label>
                                {loadingTradeableTokens ? (
                                    <p>Loading tradable tokens, this might take a few seconds...</p>
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
                            <div>
                                <label>Amount: </label>
                                <input
                                    type="number"
                                    value={swapAmount}
                                    onChange={(e) => setSwapAmount(e.target.value)}
                                    placeholder="Enter amount"
                                />
                            </div>
                            {expectedOutput && (
                                <div>
                                    <p>Expected Output: {expectedOutput} {toToken === 'SOL' ? 'SOL' : 'tokens'}</p>
                                     {/*TODO: Add robustness for when fee is not found*/}
                                    <p>Estimated Fees: {fees?.amount?.toFixed(9)} {fees?.mint === SOL_MINT ? 'SOL' : 'tokens'}</p>
                                </div>
                            )}
                            <button
                                onClick={handleSwap}
                                disabled={!fromToken || !toToken || !swapAmount || fromToken === toToken}
                            >
                                Swap
                            </button>
                            {fromToken === toToken && fromToken && (
                                <p style={{ color: 'red' }}>From and To tokens cannot be the same.</p>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default App;
