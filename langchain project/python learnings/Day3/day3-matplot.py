# Matplotlob
# seaborn
# plotly - interactive graph
# bookey - interactive graph, dashboards



#pie
#bar
#line
#donut
#scatter

import matplotlib.pyplot as plt
import numpy as np

# # Generate data for a Line plot
# x = np.linspace(0, 10, 100)
# y = np.sin(x)

# # Create a Line plot - Added missing '=' and ')'
# plt.plot(x, y, label='Sine wave', color='blue', linestyle='-', linewidth=2)

# # Add Labels and title
# plt.xlabel('X-axis')
# plt.ylabel('Y-axis')
# plt.title('Line plot: Sine wave')

# # Add a Legend
# plt.legend()

# # Show the plot - Added missing '()'
# plt.show()

# # 1. Generate data for a scatter plot
# # np.random.rand gives numbers between 0 and 1
# x = np.random.rand(100) 

# # np.random.randn gives a "normal distribution" (noise) 
# # This creates a linear relationship: y = 2x + noise
# y = 2 * x + np.random.randn(100)

# # 2. Create a scatter plot
# plt.scatter(x, y, color='green', marker='o', label='Random data')

# # 3. Add Labels and title
# plt.xlabel('X-axis')
# plt.ylabel('Y-axis')
# plt.title('Scatter plot: Random data')

# # 4. Add a Legend
# plt.legend()

# # 5. Show the plot 
# # (Crucial: without this, the plot won't display in a standard Python script)
# plt.show()

# # 1. Generate data for a box plot
# # Creating 3 groups with different spreads
# data = [
#     np.random.normal(0, 1, 100),   # Group 1: Standard spread
#     np.random.normal(0, 1.5, 100), # Group 2: Wider spread
#     np.random.normal(0, 2, 100)    # Group 3: Very wide spread
# ]

# # 2. Create a box plot
# # patch_artist=True allows us to fill the boxes with color
# plt.boxplot(data, labels=['Group 1', 'Group 2', 'Group 3'], patch_artist=True)

# # 3. Add Labels and title
# plt.xlabel('Groups')
# plt.ylabel('Values')
# plt.title('Box plot: Group comparison')

# # 4. Show the plot
# plt.show()

# # 1. Generate data for a bar chart
# categories = ['Category A', 'Category B', 'Category C']
# values = [25, 40, 15]

# # 2. Create a bar chart
# # Added missing label text 'Bar Data' to complete the line from your image
# plt.bar(categories, values, color='orange', edgecolor='black', label='Bar Data')

# # 3. Add Labels and title
# plt.xlabel('Categories')
# plt.ylabel('Values')
# plt.title('Bar chart: Category comparison')

# # 4. Add a Legend
# plt.legend()

# # 5. Show the plot
# plt.show()

# # Generate data for an area plot
# x = np.linspace(0, 5, 100)
# y1 = x
# y2 = x**2

# # Create an area plot
# # Added missing comma after alpha=0.5
# plt.fill_between(x, y1, y2, alpha=0.5, label='Area between curves')

# # Add Labels and title
# plt.xlabel('X-axis')
# plt.ylabel('Y-axis')
# plt.title('Area plot: Between two curves')

# # Add a Legend
# plt.legend()

# # Show the plot
# plt.show()

# Sample data
values = [30, 40, 30]
labels = ['Category A', 'Category B', 'Category C']

# Create a pie chart
# autopct='%1.1f%%' formats the numbers as percentages (e.g., 40.0%)
# startangle=90 rotates the start of the chart to the top
plt.pie(values, labels=labels, autopct='%1.1f%%', startangle=90)

# Add a title
plt.title('Pie chart example')

# Display the chart
plt.show()