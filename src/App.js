import React, { useState, useEffect } from 'react';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

function App() {
    const { publicKey } = useWallet();
    const [tokens, setTokens] = useState([]);
    const [loading, setLoading] = useState(false);
    const [fromToken, setFromToken] = useState('');
    const [toToken, setToToken] = useState('');
    const [swapAmount, setSwapAmount] = useState('');
    const [expectedOutput, setExpectedOutput] = useState(null);
    const [fees, setFees] = useState(null);

    useEffect(() => {
        if (publicKey) {
            setLoading(true);
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
                    console.error('Error fetching tokens:', error);
                } finally {
                    setLoading(false);
                }
            };

            fetchTokens();
        }
    }, [publicKey]);

    useEffect(() => {
        const fetchSwapQuote = async () => {
            if (fromToken && toToken && swapAmount) {
                try {
                    const inputAmount = fromToken === 'SOL' ? swapAmount * LAMPORTS_PER_SOL : swapAmount;

                    const response = await fetch(`https://quote-api.jup.ag/v1/quote?inputMint=${fromToken}&outputMint=${toToken}&amount=${inputAmount}&slippageBps=50`);
                    const data = await response.json();

                    if (data && data.data && data.data[0]) {
                        const quote = data.data[0];
                        setExpectedOutput(quote.outAmount / LAMPORTS_PER_SOL); // Convert back to SOL or token unit
                        setFees(quote.feeAmount / LAMPORTS_PER_SOL); // Estimate fees
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

    const filteredToTokens = tokens.filter((token) => token.address !== fromToken);

    return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", flexDirection: "column" }}>
            <h1>Solana Swap</h1>
            <WalletMultiButton />
            {publicKey && (
                <div style={{ marginTop: '20px' }}>
                    {loading ? (
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
                                <select value={toToken} onChange={(e) => setToToken(e.target.value)}>
                                    <option value="" disabled>Select a token</option>
                                    {filteredToTokens.map((token, index) => (
                                        <option key={index} value={token.address}>
                                            {token.address} - Balance: {token.balance}
                                        </option>
                                    ))}
                                </select>
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
                                    <p>Estimated Fees: {fees} SOL</p>
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
