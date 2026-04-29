# pandas is built on top of numpy

import pandas as pd
import matplotlib.pyplot as plt
# lst = [12, 12, 22, 33,44,66]
# srs = pd.Series(lst)
# print(srs)

# lst_ind = ['a', 'b', 'c', 'd', 'e', 'f']
# srs = pd.Series(lst, index = lst_ind)
# print(srs)

# print(srs.loc['e'])

# print(srs.iloc[4])

# d1 = {"Id": [101, 102, 102], "Name": ["Ram", "Sam", "John"]}
# df = pd.DataFrame(d1)
# print(df)

# df2 = pd.DataFrame([[101, 'Ram'], [102, "Sam"], [103, "John"]])
# print("List doesnt have keys", df2)

# df3 = pd.DataFrame([[101, 'Ram'], [102, "Sam"], [103, "John"]], columns = ['id', 'name'], index = ['a', 'b', 'c'])
# print("List doesnt have keys index changed", df3)

# loc = ["hyd", "bang", "chn"]

# df2['loc'] = pd.DataFrame(loc)

# print(df2)

df = pd.read_csv('langchain project/python learnings/Day3/student.csv')
print(df)

#1. Exploratory

dfhead = df.head()
print(dfhead)

dftail = df.tail()
print(dftail)

#attributes(properties of data frames)
# columns
# datatypes
# shapes
# size

dfcolumns = df.columns
print(dfcolumns)

print("shapes",df.shape)

print("size",df.size)

print("dtypes",df.dtypes)

print("count",df.count())

print("info", df.info())

print("describe", df.describe())

# insights
# We have two numerical columns and other categorical fields
# We have duplicate data and missing fields
# 35 rows and 5 columns


checknull = df.isnull().sum()
print("check nulll values", checknull)

# 2. fixing null values
# update all the null value with 0 - df.fillna(0)
# remove all the rows which has nulls - df.drop
# update the null with mean value

df_fill = df.fillna(df[['mark']].mean())
print(df_fill)

# check
print("describe", df.describe())

df_fill = df_fill.fillna({'name': 'NOT FOUND', 'class': 'NOT FOUND', 'gender': 'NOT FOUND'})
print(df_fill)

df_fill.duplicated().sum()

df_no_dup = df_fill.drop_duplicates()

# reset the index

df_no_dup.reset_index(inplace=True, drop= True)
df_no_dup.set_index(['id', 'name'])
print('df_no_dup', df_no_dup)


# 3. Data Transformation

# data binning

# 0-20 F
# 21-40 D
# 41-60 C
# 60-80 B
# 81-100 A

if 'mark' in df_no_dup.columns:

    bin_edges = [0, 20, 40, 60, 80, 100]
    bin_labels = ['F', 'D', 'C', 'B', 'A']
 
    df_no_dup['grades'] = pd.cut(df_no_dup['mark'], bins= bin_edges, labels=bin_labels)

    print('Grades have been added to dataframe')
    print(df_no_dup)

# Outliers

# Joints


# Joining 

df1= pd.DataFrame(
{ "Α": ["ΑΘ", "A1", "A2", "A3",], "Β": ["ΒΘ", "B1", "B2", "B3"], "C": ["CO", "C1", "C2", "C3"], "D": ["De", "D1", "D2", "D3"], }, index =[0,1,2,3], )

df2 = pd.DataFrame({ 
    "A": ["A4", "A5", "A6", "A7"], 
    "B": ["B4", "B5", "B6", "B7"], 
    "C": ["C4", "C5", "C6", "C7"], 
    "D": ["D4", "D5", "D6", "D7"] 
}, index=[4, 5, 6, 7])


# Standard vertical concatenation
result = pd.concat([df1, df2])
print(result)


# Define df3
df3 = pd.DataFrame({
    "Key1": ["k0", "k0", "k1", "k2"],
    "Key2": ["k0", "k1", "k0", "k1"],
    "A": ["A0", "A1", "A2", "A3"],
    "B": ["B0", "B1", "B2", "B3"]
})

# Define df4
df4 = pd.DataFrame({
    "Key1": ["k0", "k1", "k1", "k2"],
    "Key2": ["k0", "k0", "k0", "k0"],
    "C": ["C4", "C5", "C6", "C7"],
    "D": ["D4", "D5", "D6", "D7"]
})

full = pd.merge(df3, df4, how="outer", on=["Key1", "Key2"])
print(full)

innr = pd.merge(df3, df4, how="inner", on=["Key1", "Key2"])
print(innr)

cross = pd.merge(df3, df4, how="cross")
print(cross)

# Define df5 (The caller)
df5 = pd.DataFrame({
    "A": ["A0", "A1", "A2", "A3"],
    "B": ["B0", "B1", "B2", "B3"],
    "Key1": ["k0", "k0", "k1", "k1"]
})

# Define df6 (The joined dataframe)
# Note: This dataframe uses Key1 values as its index
df6 = pd.DataFrame({
    "C": ["C4", "C5"],
    "D": ["D4", "D5"]
}, index=["k0", "k1"])

# Define df5 (The caller)
df5 = pd.DataFrame({
    "A": ["A0", "A1", "A2", "A3"],
    "B": ["B0", "B1", "B2", "B3"],
    "Key1": ["k0", "k0", "k1", "k1"]
})

# Define df6 (The joined dataframe)
# Note: This dataframe uses Key1 values as its index
df6 = pd.DataFrame({
    "C": ["C4", "C5"],
    "D": ["D4", "D5"]
}, index=["k0", "k1"])

df_no_dup.to_excel(r"langchain project/python learnings/Day3/demo1.xlsx", index=False)



# 1. Prepare the data: Count occurrences of each grade
grade_counts = df_no_dup['grades'].value_counts().sort_index()

# 2. Extract categories and their corresponding heights
categories = grade_counts.index.tolist()
values = grade_counts.values.tolist()

# 3. Create the Bar Chart
plt.figure(figsize=(8, 5))
plt.bar(categories, values, color='skyblue', edgecolor='black')

# 4. Add Labels and Title
plt.xlabel('Grades')
plt.ylabel('Number of Students')
plt.title('Distribution of Student Grades')

# 5. Show the plot
plt.show()