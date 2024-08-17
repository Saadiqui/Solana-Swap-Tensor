import React, { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter} from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

require('@solana/wallet-adapter-react-ui/styles.css'); // Import default styles for wallet UI

const WalletConnectionProvider = ({ children }) => {
    // You can switch between 'mainnet-beta', 'testnet', and 'devnet' as needed.
    const network = clusterApiUrl('devnet');

    const wallets = useMemo(
        () => [
            new PhantomWalletAdapter(),
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
