bigString = ['absdca', 'baby', 'water', 'abcdef']

print("--- Finding Unique Character Counts ---\n")

bigStringCount = 0
biggestString = ''

for word in bigString:
    # Step 1 — convert to set (removes duplicates)
    uniqueChars = set(word)
    print(f"word          : {word}")
    print(f"unique chars  : {uniqueChars}")

    # Step 2 — count unique characters
    uniqueCount = len(uniqueChars)
    print(f"unique count  : {uniqueCount}")

    # Step 3 — compare with current biggest
    if uniqueCount > bigStringCount:
        bigStringCount = uniqueCount
        biggestString  = word
        print(f"new biggest   : {biggestString}")

    print("─" * 30)

print(f"\nBiggest string  : {biggestString}")
print(f"Unique count    : {bigStringCount}")