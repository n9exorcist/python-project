# Write a function that: 
# 1. Normalizes text (lowercase) 
# 2. Removes punctuation 
# 3. Returns the first non-repeating word 
# 4. If all words repeat, 
# return None Example: 
# Input: "This is a test this is only a test" 
# Output: "only"

input = "This, is a test this is only a test!"

import string

def first_non_repeating_word(text):

    normalized = text.lower()

    print(f"Step 1 normalized: {normalized}")

    print(string.punctuation)

    for char in string.punctuation:

        normalized = normalized.replace(char, "")

        # print(f"text: {text}")

    print(f"Step 2 no punct  : {normalized}")

    words = normalized.split()

    print(f"Step 3 words : {words}")

    word_count = {}

    for word in words:

        if word in word_count:

            word_count[word] += 1

        else:

            word_count[word] = 1

    print(f"Step 4 word_count : {word_count}")   

    for word in words:

        if word_count[word] == 1:

            return word  

    return None

result = first_non_repeating_word("This, is a test this is only a test!")

print(f"Result: {result}")