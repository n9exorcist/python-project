forenmName = 'narayanan'
afternName = 'selvaraj'

forenmName = list(forenmName.lower())
afternName = list(afternName.lower())
print(f"fore", forenmName)

forenmName[0] = forenmName[0].upper()
afternName[0] = afternName[0].upper()
print(f"firstLetter", forenmName[0])
print(f"secondLetter", afternName[0])

first = "".join(forenmName)
second = ''.join(afternName)

print(f"first", first)
print(f"second", second)

fullname = ' '.join([first, second])
print(f"fullname", fullname)

fullnameSplit = fullname.split()
print(f"fullnameSplit", fullnameSplit)

reverese = ' '.join(word[::-1] for word in fullname.split())
print(f"reverese", reverese)