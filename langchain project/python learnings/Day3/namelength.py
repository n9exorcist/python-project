name = "Dikshitha"

count = 0
print(f"name: {name}")
print(type(name))
cha_count = list(name)
print(type(cha_count))
"""
we are using list because, list is mutable, while strings are not
using list I, will get cha_count as 	['N', 'a', 'r', 'a', 'y', 'a', 'n', 'a', 'n']
"""
print(type(name))

for cha in cha_count:

    print(f"chaname: {cha}")
    count = count +1

print(f"name: {name}")
print(f"count: {count}")