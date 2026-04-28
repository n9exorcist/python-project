#Conditional Programming
# age = 19
# if age > 18:
#     print("you can ride gaint wheel")
# print("next")

# age = int(input("Enter age:"))

# if age > 18:
#     print("Welcome")

# elif age > 20:
#     print("you can go for big rides")
# else:
#     print("Thanks for the participation")




# age = int(input("Enter age:"))

# if (age > 18 and age < 20) or age == 17:
#     print("Welcome")

# elif age > 20:
#     print("you can go for big rides")
# else:
#     print("Thanks for the participation")

# Loops in Python

# a int, a = 1, a+=1

# declare
# assign
# increment/decrement

# print(list(range(0, 3)))
# print(list(range(10, 22)))
# print(list(range(10, 22, 2)))

# year =[22, 23, 24, 25, 26, 27]
# leng = len(year)
# print(leng)

# for i in range(leng):
#     print("the value of i", i)
#     print("the year of i", year[i])

# year =[22, 23, 24, 25, 26, 27]
# leng = len(year)
# print(leng)

# for i in range(1,3):
#     print("the value of i", i)
#     print("the year of i", year[i])


# for i in year:
#     print("the value of i", i)
#     print("the year of i", year)

# enum - both index and value of the element

# clr = ['red', 'yellow', 'blue', 'white']

# for index, value in enumerate(clr):
#     print("at the index", index, "at the value", value)

# list comprehension

# create a list in single line of code by apply range and filter
# lis = [x for x in range(10)]
# print(lis)
# # lis = [x for x in range(10) if x%2 == 0]
# # print(lis)

# str1 = ['odd' if x%2 !=0 else 'even' for x in lis]
# print(lis)

# while loop - only until certain is met

# year = [22, 23, 24, 25, 26]

# i = 0
# yr =0 

# while(yr < 26):
#     print("before index", i)
#     print("before assign", yr)
#     yr = year[i]
#     i = i +1
#     print ("After index " ,i)
#     print ("After assign " ,yr)
#     print ("___________________")

# print ("it took", i, "iterations to compile the loop")

# break exit the loop

# a = 1
# while a < 10:
#     print(a)
#     if(a==6):
#         break
#     a += 1

# continue  - will ignore the current run and then proceed with next itertion

# for i in range(1, 11):
#     if i == 5:
#         continue
#     print(i)

# for i in range(1, 11):
#     if i == 5:
#         break
#     print(i)

# functions

# reusable block of case
# code redudunacy

# def func_name():
#     statement1
#     statement2
#     retrun

# def incr(num): # Defining a function

#     """
#     Doc Stings:
#     o4/28/2026 Function created

#     s=yntax: incr(num)

#     increament a number
#     """

#     res = num + 1
#     return res

# print(incr(3)) #calling a function


# default arguements

# def mult(num1, num2 = 3):
#     return num1*num2

# print(mult(2, 6))

# arbitary argument

# def student(name, age, *sub): #args should always be the last parameter in the list
#     print (name)
#     print (age)
#     print (sub)
#     print(type(sub))

# student("Rahul", 5, "English", "Math", "Physics")

# key value args

# def introduce (**kwargs):
#     if "name" in kwargs and "age" in kwargs:
#         print ("Hello", kwargs['name'], "You are", kwargs['age'], "years old")
#     elif "name" in kwargs:
#         print ("Hello", kwargs['name'])
#     else:
#         print("Hello")

# print(introduce(name = "Rahul", age = 30))
# print(introduce(name = "Rahul"))
# print(introduce())
# print(introduce(name = "Rahul", loc="HYD"))


# def func(*args, **kwargs):
#     print(args)
#     print(*args)
#     print(kwargs)
#     print(**kwargs)

# print(func(1,2,3,4))    


# class Cake:
#     def __init__ (self, flavor, layers, toppings):
#         self.flavor = flavor
#         self.layers = layers
#         self.toppings = toppings

#     def describe_cake(self):
#         description = (f"This is a {self.flavor} - layered {self.layers} cake"
#                        f"with the following toppings: {', ' .join(self.toppings)}")
#         return description
    
#     def bake(self):
#         return "The cake is being baked"
                       
# #creating Objects

# choc_cake = Cake("chocolate", 3, ["crisp", "nutes"])
# print(choc_cake.describe_cake())
# print(choc_cake.layers)

# choc_cake= Cake("Vanilla", 4, [])
# print(choc_cake.describe_cake())
# print(choc_cake.bake())

# "this is a normal string"
# f"this is  a formatted string"
# r"this is a raw string use to pass the paths"


# __init__ --> intiliaze --> constructor --> intilaize the object

# self --> refernce to the newly created instance of the class.

# encapsulation, polymorphism and inheritance

# encapsulation = Packaging your methods and data attributes

# Data Hiding + security controlled accesss

# Polymorphism = multiple usage of same functions

# same function

# class Tv:
#     def turn_on(self):
#         return "Turing on the TV"
    
# class Radio:
#     def turn_on(self):
#         return "Turing on the Radio"

# def alexa_turn_on(device): # remote which will accept any type of object
#     return device.turn_on()

# tv_obj = Tv()
# radio_obj = Radio()

# print(alexa_turn_on(tv_obj))
# print(alexa_turn_on(radio_obj))


# Inheretence
# parent --> child inhert the properties from parent

# single inherit

# class A:
#     def func1(self):
#         print('this is a base class function')

# class B(A): #B is child of A and B has access to all the methods of A
#     def func2(self):
#         print('this is a base child function')


# obj_a = A()
# obj_b = B()

# print(obj_a.func1())
# print(obj_b.func1())
# print(obj_b.func2())


# bank accounts --> saving and current

# Parent class
class BankAccount:
    def __init__(self, name, balance=0):
        self.name = name
        self.balance = balance

    def show_balance(self):
        return f"Account holder: {self.name}, balance: ${self.balance}"
    
    def deposit(self, amount):
        if amount > 0:
            self.balance += amount
            return f"${amount} deposited. New balance is ${self.balance}"
        else:
            return "Deposit amount should be greater than 0"

    def withdraw(self, amount):
        if 0 < amount <= self.balance:
            self.balance -= amount
            return f"${amount} withdrawn. New Balance after withdrawn ${self.balance}"
        else:
            return "Insufficent funds"      




# child class for a banking account

class SavingsAccount(BankAccount):
    def __init__(self, name, balance=0, interest_rate=0.10):
        super().__init__(name, balance) #used to refere to the parent class, allows to get the attributes and method of a parent
        self.interest_rate = interest_rate #extra attribute

    def deposit(self, amount):
        # 1. Runs parent method (adds base amount to balance)
        parent_dep = super().deposit(amount) # parent class deposit method is executed
        if amount > 0:
            # 2. Calculate the 10% interest
            interest = self.interest_rate * amount
            self.balance += interest # Add interest to total
            
            # 3. Add the calculation breakdown to the console message
            # We use {self.interest_rate * 100}% to show "10.0%"
            parent_dep += f" | Interest Added ({self.interest_rate * 100}%): ${interest} | Total: ${self.balance}"
        return parent_dep    
        

# rahul_base_account = BankAccount("Rahul", 100)
# print(rahul_base_account.show_balance())
# print(rahul_base_account.deposit(50))

ram_child_acc = SavingsAccount("Ram", 200)

print(ram_child_acc.show_balance())

ram_child_acc = SavingsAccount("Ram", 200, 0.10) # 10% interest

# This triggers the SavingsAccount version of deposit
print(ram_child_acc.deposit(100))

# Even though it's not defined in SavingsAccount, it works!
print(ram_child_acc.withdraw(50))

