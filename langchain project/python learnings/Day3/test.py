name1 = 'Narayanan'
name2 = 'Mayuri'

nameStr1 = list(name1)
nameStr2 = list(name2)

nameReverse1 = nameStr1[::-1]

nameReverse2 = nameStr2[::-1]

nameReverse1[-1] = nameReverse1[-1].capitalize()
nameReverse2[-1] = nameReverse2[-1].capitalize()


nameReverse2Name = "".join(nameReverse2)
nameReverse1Name = "".join(nameReverse1)

nameReverseJoin = [nameReverse2Name, nameReverse1Name ]
print(f"nameReverseJoin", nameReverseJoin)


count = 0
comparenamecount = 0
name1Arr = []
comparenameArray = []

for nameSplit in nameStr1:
    count = count + 1
print(f"count", count)

for namepresent in nameStr1:
    if namepresent in nameStr2 and namepresent not in comparenameArray:
        comparenameArray.append(namepresent)
print(f"comparenameArray", comparenameArray)


# Write a function that: 
# 1. Normalizes text (lowercase) 
# 2. Removes punctuation 
# 3. Returns the first non-repeating word 
# 4. If all words repeat, 
# return None Example: 
# Input: "This is a test this is only a test" 
# Output: "only"


def normalizeText(text):
    text= text.lower()

    clean = ""
    for char in text:
        if char.isalpha() or char == " ":
            
            clean += char
            print(f"clean", clean)
    

    text = clean.split()
    print(f"text", text)

    emptyArray = {}
    counter = 0

    for l in text:
        if l in emptyArray:
            emptyArray[l] += 1
            print(f"emptyArray if block", emptyArray)
        else:
            emptyArray[l] = 1
            print(f"emptyArray else block", emptyArray)
        counter += 1 


    for word in text:

       if emptyArray[word] == 1:
           print(f"word", word)
           return word

    return None

normalizeText("This, is a test this is only a test!")

# age = input("Enter age: ")
# if age.isdigit():
#     print(f"Age is {age}")
# else:
#     print("Please enter a valid number")

password = "Hello23"
if any(c.isupper() for c in password):
    print("Has uppercase")

if any(c.isdigit() for c in password):
    print("Has Number")

text = "My Salary is 10000000 per year"
numbers = "".join(c for c in text if c.isdigit())
print(numbers)

text = "abc123def"
letters = "".join(c for c in text if c.isalpha())
print(letters)