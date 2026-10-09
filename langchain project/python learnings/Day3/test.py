name = "Narayanan"
count = 0

# Python splits strings into characters automatically when converting to a list
name_split = list(name)

# Loop through the list and count the elements
for i in range(len(name_split)):
    count += 1

print(count)  # Output: 9
