import {LAMPORTS_PER_SOL, PublicKey} from '@solana/web3.js';
import {
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import * as OutboundCallsUtils from './outboundCallsUtils.js'
import { SOL_MINT } from './App.js';

export async function ConvertTokenAmountToUnits(mintAccount, amount) {
    const tokenInfo = await OutboundCallsUtils.getTokenInformation(mintAccount)
    return mintAccount === SOL_MINT
        ? amount * LAMPORTS_PER_SOL
        : amount * Math.pow(10, tokenInfo.decimals)
}

export async function ConvertUnitsToTokenAmount(mintAccount, units) {
    const tokenInfo = await OutboundCallsUtils.getTokenInformation(mintAccount)
    return mintAccount === SOL_MINT
        ? units / LAMPORTS_PER_SOL
        : units / Math.pow(10, tokenInfo.decimals)
}

export async function DetermineTokenProgram(mintAddress, connection) {
    const mintAccountInfo = await connection.getParsedAccountInfo(new PublicKey(mintAddress));
    const ownerProgramId = mintAccountInfo.value.owner.toBase58();

    switch (ownerProgramId) {
        case TOKEN_2022_PROGRAM_ID.toBase58():
            return TOKEN_2022_PROGRAM_ID
        case TOKEN_PROGRAM_ID.toBase58():
            return TOKEN_PROGRAM_ID
        default:
            throw new Error("Unknown token program ID");
    }
}

export async function FetchUserWalletTokens(publicKey, connection, tokenProgramID) {
    try {
        const tokenProgramAccounts = await connection.getParsedTokenAccountsByOwner(
            publicKey,
            { programId: tokenProgramID }
        );

        const userTokens = await Promise.all(
            tokenProgramAccounts.value.map(async (tokenAccount) => {
                const accountInfo = tokenAccount.account.data.parsed.info;
                const tokenBalance = accountInfo.tokenAmount.uiAmount;
                const tokenInfo = await OutboundCallsUtils.getTokenInformation(accountInfo.mint);

                return { address: tokenInfo.mintAddress, symbol: tokenInfo.symbol, balance: tokenBalance };
            })
        );

        return userTokens.filter(token => token.symbol !== "UNK")
    } catch (error) {
        console.error('Error fetching user\'s tokens:', error);
    }
}

export function GetTokenBalance (tokens, tokenAddress) {
    const token = tokens.find((t) => t.address === tokenAddress);
    return token ? token.balance : 0;
}

export function FilteredToTokens(availableTokens, fromToken) {
    return availableTokens.filter(
        (token) => token.address !== fromToken
    );
}