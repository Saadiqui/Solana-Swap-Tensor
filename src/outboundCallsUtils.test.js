import * as OutboundCallsUtils from './outboundCallsUtils.js'
import {PublicKey, Transaction} from '@solana/web3.js';
import {
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    TOKEN_2022_PROGRAM_ID
} from '@solana/spl-token'
import * as Utils from "./utils";

describe('getTokenInformation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const testCases = [
        {
            description: 'should return token information when the API call is successful',
            mintAccount: 'MockMintAccount',
            fetchResponse: {
                name: 'Test Token',
                symbol: 'TT',
                address: 'TestAddress',
                decimals: 6,
            },
            expected: new OutboundCallsUtils.TokenInfo('Test Token', 'TT', 'TestAddress', 6),
        },
        {
            description: 'should return "Unknown" token info when no data is returned',
            mintAccount: 'MockMintAccount',
            fetchResponse: null,
            expected: new OutboundCallsUtils.TokenInfo("Unknown", "UNK", "", 9),
        },
    ];

    global.fetch = jest.fn();

    testCases.forEach(({ description, mintAccount, fetchResponse, expected }) => {
        test(`${description}`, async () => {
            fetch.mockResolvedValueOnce({
                json: async () => fetchResponse,
            });

            const result = await OutboundCallsUtils.getTokenInformation(mintAccount);

            expect(result).toEqual(expected);
            expect(fetch).toHaveBeenCalledWith(`https://tokens.jup.ag/token/${mintAccount}`);
        });
    });
});

describe('FetchSwapInfo', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const testCases = [
        {
            description: 'should return swap info when API call is successful',
            fetchResponse: {
                json: async () => ({
                    inAmount: 1000,
                    otherAmountThreshold: 950,
                }),
            },
            inputMint: 'input-mint-address',
            outputMint: 'output-mint-address',
            amount: 500,
            shouldThrow: false,
            expected: {
                inAmount: 1000,
                otherAmountThreshold: 950,
                quoteResponse: {
                    inAmount: 1000,
                    otherAmountThreshold: 950,
                },
            },
        },
        {
            description: 'should handle errors gracefully if the API call fails',
            fetchResponse: new Error('API failure'),
            inputMint: 'input-mint-address',
            outputMint: 'output-mint-address',
            amount: 500,
            expected: 'API failure',
            shouldThrow: true,
        },
        {
            description: 'should handle missing data fields in the response',
            fetchResponse: {
                json: async () => ({
                    inAmount: 1000,
                    // otherAmountThreshold is missing
                }),
            },
            inputMint: 'input-mint-address',
            outputMint: 'output-mint-address',
            amount: 500,
            shouldThrow: false,
            expected: {
                inAmount: 1000,
                otherAmountThreshold: undefined,
                quoteResponse: {
                    inAmount: 1000,
                },
            },
        },
    ];

    testCases.forEach(({ description, fetchResponse, inputMint, outputMint, amount, expected, shouldThrow }) => {
        test(`${description}`, async () => {
            if (fetchResponse instanceof Error) {
                global.fetch = jest.fn(() => Promise.reject(fetchResponse));
            } else {
                global.fetch = jest.fn(() => Promise.resolve(fetchResponse));
            }

            if (shouldThrow) {
                await expect(OutboundCallsUtils.FetchSwapInfo(inputMint, outputMint, amount)).rejects.toThrow(expected);
            } else {
                const result = await OutboundCallsUtils.FetchSwapInfo(inputMint, outputMint, amount);
                expect(result).toEqual(expected);
            }

            expect(global.fetch).toHaveBeenCalledWith(
                `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`
            );
        });
    });
});

// Mocks should be placed outside the `describe` block
jest.mock('./utils', () => ({
    DetermineTokenProgram: jest.fn(),
}));

jest.mock('@solana/spl-token', () => ({
    getAssociatedTokenAddress: jest.fn(),
    createAssociatedTokenAccountInstruction: jest.fn(),
    ASSOCIATED_TOKEN_PROGRAM_ID: 'AssociatedTokenProgramID',
}));

describe('EnsureAssociatedTokenAccountExists', () => {
    const mockConnection = {
        getParsedAccountInfo: jest.fn(),
        getAccountInfo: jest.fn(),
        getLatestBlockhash: jest.fn(),
        simulateTransaction: jest.fn(),
        confirmTransaction: jest.fn(),
    };
    const mockSendTransaction = jest.fn();

    const testCases = [
        {
            description: 'should return the associated token address if account already exists',
            accountInfo: { someData: 'exists' },
            simulationSuccess: true,
            transactionSuccess: true,
            expected: 'mockAssociatedTokenAddress',
        },
        // TODO: Add test cases for creating new ATAs
    ];

    beforeEach(() => {
        jest.clearAllMocks();
        getAssociatedTokenAddress.mockResolvedValue('mockAssociatedTokenAddress');
    });

    testCases.forEach(({ description, accountInfo, simulationSuccess, transactionSuccess, expected, expectedError }) => {
        test(`${description}`, async () => {
            Utils.DetermineTokenProgram.mockResolvedValue('mockTokenProgramId');
            mockConnection.getParsedAccountInfo.mockResolvedValue(accountInfo);
            mockConnection.getAccountInfo.mockResolvedValue(accountInfo)

            const result = await OutboundCallsUtils.EnsureAssociatedTokenAccountExists('mockMint', 'mockOwner', mockConnection, mockSendTransaction);
            expect(result).toBe(expected);
            expect(createAssociatedTokenAccountInstruction).not.toHaveBeenCalled();
        });
    });
});