#!/usr/bin/env python3

def fibonacci_generator():
    """Generator that yields fibonacci numbers indefinitely."""
    a, b = 0, 1
    while True:
        yield a
        a, b = b, a + b

def print_first_n_fibonacci(n):
    """Print the first n fibonacci numbers."""
    fib_gen = fibonacci_generator()
    for i in range(n):
        print(f"{i + 1}: {next(fib_gen)}")

if __name__ == "__main__":
    print("First 1000 Fibonacci numbers:")
    print_first_n_fibonacci(1000)