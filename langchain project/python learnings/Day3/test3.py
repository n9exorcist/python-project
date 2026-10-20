
# Question 4 — Remove Duplicate Words
# Write a function that:
# 1. Normalizes text (lowercase)
# 2. Removes punctuation
# 3. Removes duplicate words
# 4. Keeps original order
# 5. Returns cleaned sentence

def normalize(text):

    text = text.lower()

    print(f"text", text)

    context = ""
    

    for punct in text:
        if punct.isalpha() or punct == " ":
            context += punct
    print(f"context", context)

    words = context.split()

    print(f"words", words)

    seen = []
    unique = []

    for word in words:
        if word not in seen:
            seen.append(word)
            unique.append(word)
        else:
            print(f"duplicate removed: {word}")    

    print(f"unique:{unique}")
    print(f"seen:{seen}")

    return " ".join(unique)


result = normalize("Hello World!")
print(f"result", result)