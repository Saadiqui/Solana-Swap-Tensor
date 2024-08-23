import * as Utils from './utils.js'
import * as OutboundCallsUtils from './outboundCallsUtils';
import {
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { SOL_MINT } from './App.js'
import {PublicKey, LAMPORTS_PER_SOL} from '@solana/web3.js';

describe('FilteredToTokens', () => {
    const testCases = [
        {
            description: 'should filter out the fromToken from the available tokens',
            availableTokens: [
                { address: 'TokenA', symbol: 'TA' },
                { address: 'TokenB', symbol: 'TB' },
                { address: 'TokenC', symbol: 'TC' },
            ],
            fromToken: 'TokenB',
            expectedResult: [
                { address: 'TokenA', symbol: 'TA' },
                { address: 'TokenC', symbol: 'TC' },
            ],
        },
        {
            description: 'should return all tokens if fromToken is not in the list',
            availableTokens: [
                { address: 'TokenA', symbol: 'TA' },
                { address: 'TokenB', symbol: 'TB' },
                { address: 'TokenC', symbol: 'TC' },
            ],
            fromToken: 'TokenD', // Not in the list
            expectedResult: [
                { address: 'TokenA', symbol: 'TA' },
                { address: 'TokenB', symbol: 'TB' },
                { address: 'TokenC', symbol: 'TC' },
            ],
        },
        {
            description: 'should return an empty array if availableTokens is empty',
            availableTokens: [],
            fromToken: 'TokenA',
            expectedResult: [],
        },
    ];

    testCases.forEach(({ description, availableTokens, fromToken, expectedResult }) => {
        test(`${description}`, () => {
            const result = Utils.FilteredToTokens(availableTokens, fromToken);
            expect(result).toEqual(expectedResult);
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
                await expect(Utils.FetchSwapInfo(inputMint, outputMint, amount)).rejects.toThrow(expected);
            } else {
                const result = await Utils.FetchSwapInfo(inputMint, outputMint, amount);
                expect(result).toEqual(expected);
            }

            expect(global.fetch).toHaveBeenCalledWith(
                `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`
            );
        });
    });
});

describe('GetTokenBalance', () => {
    const testCases = [
        {
            description: 'should return the correct balance when the token exists in the list',
            tokens: [
                { address: 'TokenA', balance: 100 },
                { address: 'TokenB', balance: 200 },
                { address: 'TokenC', balance: 300 },
            ],
            tokenAddress: 'TokenB',
            expected: 200,
        },
        {
            description: 'should return 0 when the token does not exist in the list',
            tokens: [
                { address: 'TokenA', balance: 100 },
                { address: 'TokenB', balance: 200 },
            ],
            tokenAddress: 'TokenC',
            expected: 0,
        },
        {
            description: 'should return 0 when the tokens list is empty',
            tokens: [],
            tokenAddress: 'TokenA',
            expected: 0,
        },
        {
            description: 'should return 0 when tokenAddress is undefined',
            tokens: [
                { address: 'TokenA', balance: 100 },
                { address: 'TokenB', balance: 200 },
            ],
            tokenAddress: undefined,
            expected: 0,
        },
    ];

    testCases.forEach(({ description, tokens, tokenAddress, expected }) => {
        test(`${description}`, () => {
            const result = Utils.GetTokenBalance(tokens, tokenAddress);
            expect(result).toBe(expected);
        });
    });
});

describe('FetchUserWalletTokens', () => {
    const mockConnection = {
        getParsedTokenAccountsByOwner: jest.fn(),
    };

    const testCases = [
        {
            description: 'should return user tokens correctly when accounts are found',
            publicKey: 'MockPublicKey',
            tokenProgramID: 'MockTokenProgramID',
            mockTokenAccounts: {
                value: [
                    {
                        account: {
                            data: {
                                parsed: {
                                    info: {
                                        mint: 'MockMintA',
                                        tokenAmount: { uiAmount: 100 },
                                    },
                                },
                            },
                        },
                    },
                    {
                        account: {
                            data: {
                                parsed: {
                                    info: {
                                        mint: 'MockMintB',
                                        tokenAmount: { uiAmount: 200 },
                                    },
                                },
                            },
                        },
                    },
                ],
            },
            mockTokenInfo: [
                { mintAddress: 'MockMintA', symbol: 'MTA', balance: 100 },
                { mintAddress: 'MockMintB', symbol: 'MTB', balance: 200 },
            ],
            expected: [
                { address: 'MockMintA', symbol: 'MTA', balance: 100 },
                { address: 'MockMintB', symbol: 'MTB', balance: 200 },
            ],
        },
        {
            description: 'should return an empty array when no token accounts are found',
            publicKey: 'MockPublicKey',
            tokenProgramID: 'MockTokenProgramID',
            mockTokenAccounts: { value: [] },
            mockTokenInfo: [],
            expected: [],
        },
        {
            description: 'should handle error gracefully and return undefined',
            publicKey: 'MockPublicKey',
            tokenProgramID: 'MockTokenProgramID',
            mockTokenAccounts: null,
            mockTokenInfo: [],
            expected: undefined,
            shouldThrowError: true,
        },
    ];

    beforeEach(() => {
        jest.clearAllMocks();
    });

    testCases.forEach(({ description, publicKey, tokenProgramID, mockTokenAccounts, mockTokenInfo, expected, shouldThrowError }) => {
        test(`${description}`, async () => {
            if (shouldThrowError) {
                mockConnection.getParsedTokenAccountsByOwner.mockImplementationOnce(() => {
                    throw new Error('Mock error');
                });
            } else {
                mockConnection.getParsedTokenAccountsByOwner.mockResolvedValueOnce(mockTokenAccounts);
                OutboundCallsUtils.getTokenInformation = jest.fn().mockImplementation(async (mint) => {
                    return Promise.resolve(mockTokenInfo.find(info => info.mintAddress === mint) || { symbol: 'UNK' });
                });
            }

            const result = await Utils.FetchUserWalletTokens(publicKey, mockConnection, tokenProgramID);
            expect(result).toEqual(expected);
        });
    });
});

describe('DetermineTokenProgram', () => {
    const mockConnection = {
        getParsedAccountInfo: jest.fn(),
    };

    const testCases = [
        {
            description: 'should return TOKEN_2022_PROGRAM_ID',
            mintAddress: 'So11111111111111111111111111111111111111112',
            mockMintAccountInfo: {
                value: {
                    owner: new PublicKey(TOKEN_2022_PROGRAM_ID),
                },
            },
            expected: TOKEN_2022_PROGRAM_ID,
        },
        {
            description: 'should return TOKEN_PROGRAM_ID',
            mintAddress: 'So11111111111111111111111111111111111111112',
            mockMintAccountInfo: {
                value: {
                    owner: new PublicKey(TOKEN_PROGRAM_ID),
                },
            },
            expected: TOKEN_PROGRAM_ID,
        },
        {
            description: 'should throw an error',
            mintAddress: 'So11111111111111111111111111111111111111112',
            mockMintAccountInfo: {
                value: {
                    owner: new PublicKey('So11111111111111111111111111111111111111112'), // Valid base58 for unknown program
                },
            },
            expectedError: 'Unknown token program ID',
        },
    ];

    beforeEach(() => {
        jest.clearAllMocks();
    });

    testCases.forEach(({ description, mintAddress, mockMintAccountInfo, expected, expectedError }) => {
        test(`${description}`, async () => {
            mockConnection.getParsedAccountInfo.mockResolvedValueOnce(mockMintAccountInfo);

            if (expectedError) {
                await expect(Utils.DetermineTokenProgram(mintAddress, mockConnection)).rejects.toThrow(expectedError);
            } else {
                const result = await Utils.DetermineTokenProgram(mintAddress, mockConnection);
                expect(result).toEqual(expected.toBase58());
            }
        });
    });
});

describe('ConvertUnitsToTokenAmount', () => {
    jest.mock('./outboundCallsUtils', () => ({
        getTokenInformation: jest.fn(),
    }));

    const testCases = [
        {
            description: 'should convert SOL units to SOL amount correctly',
            mintAccount: SOL_MINT,
            units: 1000000000,
            mockTokenInfo: { decimals: 9 },
            expected: 1,
        },
        {
            description: 'should convert token units to token amount correctly',
            mintAccount: 'NOTSOL',
            units: 1000000,
            mockTokenInfo: { decimals: 6 },
            expected: 1,
        },
    ];

    beforeEach(() => {
        jest.clearAllMocks();
    });

    testCases.forEach(({ description, mintAccount, units, mockTokenInfo, expected }) => {
        test(`${description}`, async () => {
            OutboundCallsUtils.getTokenInformation.mockResolvedValueOnce(mockTokenInfo);

            const result = await Utils.ConvertUnitsToTokenAmount(mintAccount, units);
            expect(result).toEqual(expected);
        });
    });
});

describe('ConvertTokenAmountToUnits', () => {
    jest.mock('./outboundCallsUtils', () => ({
        getTokenInformation: jest.fn(),
    }));

    const testCases = [
        {
            description: 'should convert SOL amount to units correctly',
            mintAccount: SOL_MINT,
            amount: 1,
            mockTokenInfo: { decimals: 9 },
            expected: 1 * LAMPORTS_PER_SOL,
        },
        {
            description: 'should convert token amount to units based on its decimals',
            mintAccount: 'MockTokenAddress',
            amount: 2,
            mockTokenInfo: { decimals: 6 },
            expected: 2 * Math.pow(10, 6),
        },
    ];

    beforeEach(() => {
        jest.clearAllMocks();
    });

    testCases.forEach(({ description, mintAccount, amount, mockTokenInfo, expected }) => {
        test(`${description}`, async () => {
            // Ensure the mocked function returns the expected value
            OutboundCallsUtils.getTokenInformation.mockResolvedValueOnce(mockTokenInfo);

            const result = await Utils.ConvertTokenAmountToUnits(mintAccount, amount);
            expect(result).toEqual(expected);
        });
    });
});