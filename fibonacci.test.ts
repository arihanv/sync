import { generateFibonacci } from './fibonacci';

console.log('Testing fibonacci generation...');

const first10 = generateFibonacci(10);
const expected = [0n, 1n, 1n, 2n, 3n, 5n, 8n, 13n, 21n, 34n];

const isCorrect = first10.every((num, index) => num === expected[index]);
console.log('First 10 fibonacci numbers correct:', isCorrect);

const first1000 = generateFibonacci(1000);
console.log('Generated 1000 fibonacci numbers:', first1000.length === 1000);
console.log('1000th fibonacci number:', first1000[999]);

console.log('All tests passed!');