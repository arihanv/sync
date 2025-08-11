function generateFibonacci(count: number): bigint[] {
    const fibonacci: bigint[] = [];
    
    if (count <= 0) return fibonacci;
    if (count >= 1) fibonacci.push(0n);
    if (count >= 2) fibonacci.push(1n);
    
    for (let i = 2; i < count; i++) {
        fibonacci.push(fibonacci[i - 1] + fibonacci[i - 2]);
    }
    
    return fibonacci;
}

function printFirstNFibonacci(n: number): void {
    const fibNumbers = generateFibonacci(n);
    
    console.log(`First ${n} Fibonacci numbers:`);
    fibNumbers.forEach((num, index) => {
        console.log(`${index + 1}: ${num}`);
    });
}

if (require.main === module) {
    printFirstNFibonacci(1000);
}

export { generateFibonacci, printFirstNFibonacci };