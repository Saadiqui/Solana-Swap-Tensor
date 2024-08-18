import React, { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';

const foo = require('@solana/wallet-adapter-wallets')

require('@solana/wallet-adapter-react-ui/styles.css'); // Import default styles for wallet UI

const WalletConnectionProvider = ({ children }) => {
    // You can switch between 'mainnet-beta', 'testnet', and 'devnet' as needed.
    const network = clusterApiUrl('mainnet-beta');

    const wallets = useMemo(
        () => [
            new foo.PhantomWalletAdapter(),
        ],
        [network]
    );

    return (
        <ConnectionProvider endpoint={network}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>{children}</WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};

export default WalletConnectionProvider;
