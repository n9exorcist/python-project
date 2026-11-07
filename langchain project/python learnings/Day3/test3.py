# Write a function that:
# - Takes a number
# - Returns True if prime
# - Returns False if not prime

# Prime = only divisible by 1 and itself
# 2, 3, 5, 7, 11, 13, 17, 19, 23...

# Input  : 7   Output: True
# Input  : 10  Output: False

# Hint:
# for i in range(2, number):
#     if number % i == 0:
#         ???


def primeCheck(number):

    for i in range(2, number):

        if number % i == 0:

            return False

        

    return True

www =  primeCheck(6)   

print(f"ww",www)