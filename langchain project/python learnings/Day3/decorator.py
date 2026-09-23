def my_decorator(func):
    def wrapper(*args, **kwargs):
        print('Before call')
        args = tuple(a.upper() if isinstance(a, str) else a for a in args)  # ← convert args
        result = func(*args, **kwargs)
        print('After call')
        return result
    return wrapper

@my_decorator
def greet(name):
    print(f'Hello {name}')

greet("Sudip")