# import my_calculator
# print(my_calculator.add(3,4))

import numpy as np
# # Arrays - A numpy ndarray object can be created by using np.array()
# # Python -> list - slow
# lst = [1,2,3,4,5]
# result = [x * 2 for x in lst]
# print(result)
# print(type(result))

# # Numpy Array - fast
# arr = np.array([1,2,3,4,5])
# result = arr *2 #vectorized
# print(result)
# print(type(result))



# #Create a OD Array

# arr0 = np.array (24)
# print ('e array is', arr0)

# #Create a 1D Array

# arr1= np.array([1,2,3,4])
# print ('1D array is', arr1)

# #Create a 2D Array

# arr2= np.array([[1,1,1], [1,2,1]])
# print ('20 array is', arr2)

# #Create a 3D Array

# arr3 = np.array([[[1,1,1], [2,2,2]], [[3,3,3], [4,4,4]]])
# print ('3D array is', arr3)

# # properties of an array

# print ("no of dimensions: ", arr2.ndim)

# print ("shape of array: ", arr2.shape)

# print ("size of array: ", arr2.size)

# print ("array element type: ", arr2.dtype)

# print ("array element size in bytes:", arr2.itemsize)


# # methods of an array
# # Creating arrays

# a = np.array([1, 2, 3]) # from List
# print(a)

# b = np.zeros((3, 3)) # all zeros
# print(b)

# b1 = np.zeros((3, 3), dtype=int) # all zeros
# print(b1)

# c = np.ones((2, 4)) # all ones
# print(c)

# d = np.arange(0, 10, 2) #[0,2,4,6,8]
# print(d)
# print(type(d))

# e = np.linspace(0, 1, 5) #5 evenly spaced
# print("linspace",e)

# f = np.random.rand(3, 3) #random 3x3
# print("random",f)

# g = np.eye(3) # identity matrix
# print("identity matrix",g)

# h = np.full((2, 2), 7) # filled with 7
# print("full",h)



# arr2 = np.array([[10, 20, 30, 40, 50], [60, 70, 80, 90, 101]])
# value = arr2[0, 2]
# value2 = arr2[1, 3]
# print("value of arr2", value)
# print(value2)
# print(arr2[0,2:5])

# arr3 = np.array([[[10,20,30],[60,70,80]], [[11,22,33], [44, 55, 66]]])
# print("value of arr3",arr3)
# value = arr3[1, 0, 2]
# print(value)
# print(arr3[0,1, 1:3])

a = np.array([[1,2,3],[4,5,6]]) #2x3

# Reshape and shape

b = a.reshape(3,2)
print("reshape",b)

c = a.flatten()
print("flattem",c)

d = a.ravel()
print("ravel",d)

e = a.T
f = a.transpose()

print(f)

g = a.reshape(-1)
print("reshape",g)
print("slicing",g[1:4])


x = np.concatenate([a, a])
print(x)
x1 = np.concatenate([a, a], axis=1)
print(x1)

