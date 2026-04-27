# print("Hello all")
# name = input("What is your name? ")
# training = input("What is your favorite programming language? ")
# print(f"Hello {name}, I see that your favorite programming language is {training}.")
# print("Have a great day! {}".format(name) )

# comments in python are denoted by the # symbol. Anything following the # symbol on a line is considered a comment and is ignored by the Python interpreter. Comments are used to explain code, provide context, or make notes for future reference. They can be placed on their own line or at the end of a line of code.   
# multiple line comments can be created using triple quotes (''' or """). These are often used for docstrings, which are a special type of comment used to describe the purpose of a function, class, or module.


# Primitive Data types in Python:
# # integer numbers 
# print(type(10)) # <class 'int'>
# # floating point numbers
# print(type(3.14)) # <class 'float'>
# # strings
# print(type("Hello, World!")) # <class 'str'>    
# # boolean values
# print(type(True)) # <class 'bool'>




# a = 11 # dynamic typing allows us to assign a value of any type to a variable without declaring its type explicitly. In this case, we are assigning an integer value of 11 to the variable 'a'.
# print(a) # this will print the value of 'a', which is 11    
# a = "Hello, World!" # now we are reassigning the variable 'a' to a string value "Hello, World!" without any issues, demonstrating dynamic typing in Python.
# print(a) # this will print the new value of 'a', which is "Hello, World!"

# typecasting is the process of converting a variable from one data type to another. In Python, you can use built-in functions to perform typecasting. Here are some examples:
# a = 11.11
# print(type(a)) # <class 'float'> - 'a' is currently a float
# a = int(a) # typecasting 'a' to an integer
# print(a) # 11 - the decimal part is truncated
# print(type(a)) # <class 'int'> - 'a' is now an integer
# b = "123"
# print(type(b)) # <class 'str'> - 'b' is currently a string
# b = int(b) # typecasting 'b' to an integer
# print(b) # 123 - the string is converted to an integer
# print(type(b)) # <class 'int'> - 'b' is now an integer
# c = 456
# print(type(c)) # <class 'int'> - 'c' is currently an integer
# c = str(c) # typecasting 'c' to a string
# print(c) # "456" - the integer is converted to a string
# print(type(c)) # <class 'str'> - 'c' is now a string

# type(True)
# print(type(True))
# type(1)
# print(type(1))

# bool(0)
# print(type(bool(0)))

# bool(1)
# print(type(bool(1)))


# Rules in variables in Python
#  - Case sensitive
# - a, A, _a
# - shouldnot start with numbers, 1a
# - can end with numbers, q1

# arithemtic operations
# print(5*5)
# print(5*5*5)
# print(5**5)
# print(25/6)
# print(25//6)
# print(32*2-10) #bodmass


# company = 'Accenture'
# print(company[0])
# print(company[-2])
# print(company[1:4]) #indexing/slicing
# print(company[0:9:2]) #stride
# statement = "I work at Accenture"
# print(statement.upper())
# print(statement.replace("I","We"))
# print(statement.find("We"))
# statement2 = "I am a Full stack dev"
# print(statement2.split())
# print(statement2.split('e'))


#Composite data type or Collection tyoes



# # tuples
# ordered and immutable
# print(type((1, 2.5, 'Accenture', True))) # <class 'tuple'>
# tup1 = (1)
# print(type(tup1))
# tup2 = (1,)
# print(type(tup2)) 
# ratings = (0,5,3,2,1,4)
# print(sorted(ratings))

# # lists
# ordered and mutables
# list = ["Rahul", 5, 2.4]
# tup2 = ("hyd", True)
# print(type(list)) # <class 'list'>
# print(list.extend(tup2))
# print(list)
# list4 = ["Ram", 2, 2.5]
# list5 = ("Ban", False)
# print(list4.append(list5))
# print(list4)


# # sets
# Unique, unordered, mutable
# sets = {1, 2, 3, True}
# print(type(sets)) # <class 'set'>
# # Convert list into sets
# listt = ['min', False]
# set1 = set(listt)
# print(set1)
# print(type(set1))

# set1.add(False)
# print(set1)

# set4 = {"q", "r"}
# set4.update("ps")
# print(set4)

# set4.remove("r")
# print(set4)

# print("s" in set4)
# print("a" not in set4)

# set6 = {"apple", "banana", "orange"}
# set7 = {"apple", "grape", "watermelon"}

# # To check union(intersection) of them
# inter = set6 & set7
# print(inter)
# print(set6.intersection(set7))
# print(set6.difference(set7))
# print(set6.union(set7))
# print(set6.issubset(set7))


# # dictionaries
# key - value pairs
dict = {"name": "Alice", "age": 30}
print(type(dict)) # <class 'dict'>
print(dict['name'])
print(dict.keys())
print(dict.values())
dict["location"] = "Chennai"
print(dict)
print(dict.pop("age"))
print(dict)
print(dict.popitem()) #remove last inserted values as a tuple
print(dict)


# Function --> Reusuable block of code 
# Methods ---> Functions which are created as a part of class

#sys, Math, os, sqlite3

# import sys 
# # imports the sys module, which provides access to some variables used or maintained by the interpreter and to functions that interact strongly with the interpreter.   

# import math 
# print(sys.version) # prints the version of Python being used
# print(math.sqrt(16)) # prints the square root of 16
# print(math.pi) # prints the value of pi 
# print(sys.int_info) # prints information about the integer type in Python
# print(math.ceil(25/6))
# print(math.floor(25/6))





