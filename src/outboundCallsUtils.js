class TokenInfo {
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