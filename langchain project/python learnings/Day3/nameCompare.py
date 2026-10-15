name1 = "Dikshitha"
name2 = "Chandhiran"

print(f"Name 1: {name1}")
print(f"Name 2: {name2}\n")

name1_list = list(name1.lower())
name2_list = list(name2.lower())

similar_letters = []
count = 0

print("Finding matching letters...")
for finalfname in name1_list:
    # Only execute and print when a fresh match is found
    if finalfname in name2_list and finalfname not in similar_letters:
        similar_letters.append(finalfname)
        count += 1
        print(f"  -> Found a new match: '{finalfname}' (Current Count: {count})")

# Clean, structured summary at the end
print("\n" + "="*30)
print(f"MATCHING SUMMARY")
print("="*30)
print(f"Similar Letters Found : {similar_letters}")
print(f"Total Unique Matches   : {count}")
print("="*30)
