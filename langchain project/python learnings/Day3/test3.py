# Write this from memory — no help:

def firstNonRepeating(text):
    # lowercase

    text = text.lower()
    # remove punctuation

    context = ""
    for char in text:
        if char.isalpha() or char == " ":
           context += char
    
    print(f"context", context)

    context = list(context)

    print(f"context", context)

    # count chars
    charCount = {}

    for char in context:
        if char in charCount:
            charCount[char] += 1
        else:
            charCount[char] = 1

    for char in context:
        if charCount[char] == 1:
           return char

    return None
        

edc = firstNonRepeating("swiss")
print(f"edc", edc)