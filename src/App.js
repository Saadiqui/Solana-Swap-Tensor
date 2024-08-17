import React from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

function App() {
  return (
      <div style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          flexDirection: "column"
      }}>
          <h1>Hello, World!</h1>
          <WalletMultiButton/>
      </div>
    );
}

export default App;
