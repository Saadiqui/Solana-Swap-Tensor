import React, { useState, useEffect } from 'react';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

function App() {
    const { publicKey } = useWallet();
    const [tokens, setTokens] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (publicKey) {
            setLoading(true);
            const connection = new Connection('https://api.devnet.solana.com'); // RPC endpoint

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

    return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", flexDirection: "column" }}>
            <h1>Solana Swap</h1>
            <WalletMultiButton />
            {publicKey && (
                <div style={{ marginTop: '20px' }}>
                    {loading ? (
                        <p>Loading tokens...</p>
                    ) : (
                        <select>
                            {tokens.length === 0 ? (
                                <option>No tokens found</option>
                            ) : (
                                tokens.map((token, index) => (
                                    <option key={index} value={token.address}>
                                        {token.address} - Balance: {token.balance}
                                    </option>
                                ))
                            )}
                        </select>
                    )}
                </div>
            )}
        </div>
    );
}

export default App;
