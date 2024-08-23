import * as utils from "./utils";
import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountInstruction,
    getAssociatedTokenAddress
} from "@solana/spl-token";
import {Transaction} from "@solana/web3.js";

export class TokenInfo {
    constructor(name, symbol, mintAddress, decimals) {
        this.name = name;
        this.symbol = symbol;
        this.mintAddress = mintAddress;
        this.decimals = decimals;
    }
}

export async function getTokenInformation(mintAccount) {
    const response = await fetch(`https://tokens.jup.ag/token/${mintAccount}`);

    const data = await response.json();

    if (data) {
        return new TokenInfo(data.name, data.symbol, data.address, data.decimals)
    } else {
        return new TokenInfo("Unknown", "UNK", "", 9)
    }
}

// Function to fetch swap info from Jupiter
export async function FetchSwapInfo(inputMint, outputMint, amount) {
    const response = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`);
    const data = await response.json();
    return {
        inAmount: data.inAmount,
        otherAmountThreshold: data.otherAmountThreshold,
        quoteResponse: data
    };
}

export async function fetchSwapTransaction(quoteResponse, publicKey) {
    const { swapTransaction } = await (
        await fetch('https://quote-api.jup.ag/v6/swap', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                // quoteResponse from /quote api
                quoteResponse,
                userPublicKey: publicKey.toString(),
                wrapAndUnwrapSol: true,
            })
        })
    ).json();

    return swapTransaction
}

export async function EnsureAssociatedTokenAccountExists (mint, owner, connection, sendTransaction) {
    const tokenProgramId = await utils.DetermineTokenProgram(mint, connection);

    const associatedTokenAddress = await getAssociatedTokenAddress(
        mint,
        owner,
        true,
        tokenProgramId,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const accountInfo = await connection.getAccountInfo(associatedTokenAddress);

    // if associated token account doesn't already exist, we try to create one
    if (!accountInfo) {
        try {
            const tokenProgramId = await utils.DetermineTokenProgram(mint, connection);
            const transaction = new Transaction().add(
                createAssociatedTokenAccountInstruction(
                    owner, // Payer (the wallet)
                    associatedTokenAddress,
                    owner,
                    mint,
                    tokenProgramId,
                    ASSOCIATED_TOKEN_PROGRAM_ID
                )
            );

            transaction.feePayer = owner;
            transaction.recentBlockhash = await connection.getLatestBlockhash().lastValidBlockHeight

            // Simulate the transaction first to catch any potential errors
            const simulation = await connection.simulateTransaction(transaction);
            if (simulation.value.err) {
                console.error("Simulation failed:", simulation.value.err);
                throw new Error("Simulation failed. Cannot create associated token account.");
            }

            const signature = await sendTransaction(transaction, connection);

            await connection.confirmTransaction(signature, 'finalized');
        } catch (error) {
            console.error("Failed to create associated token account:", error);
            throw error;
        }
    }

    return associatedTokenAddress;
}