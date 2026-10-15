
def add_item(value, items=[]):
    print(f"value:{value}, item{items}")
    items.append(value)
    return items

# print(add_item("A", ["X", "Y"]))
print(add_item("A"))
print(add_item("B"))
print(add_item("C"))
print(add_item("D"))
print("\n" + "="*30)
print(f"Deep copy and shallow copy")
from copy import deepcopy
original = [[1], [2]]
copied = original.copy()
print(f"copied:{copied}")
d2 = deepcopy(original)
print(f"deepcopy d2:{d2}")
d2[0] = [10]
print(f"d2 with [0]:{d2}")
# copied.append(9)
# print(f"copied after appending:{copied}")

# copied[0].append(9)
# print(f"copied with 0 after appending:{copied}")

print(f"Print Origial:{original}")
print("\n" + "="*30)
values = (x * x for x in range(3))
print(list(values)) 
print(list(values))

print("\n" + "="*30)

a = (10,)
print(type(a))

print("\n" + "="*30)

existing = ["A101", "A102"]
incoming = ["A100", "A101", "A103", "A101"]
new_ids = [value for value in incoming if value not in existing]
print(f"new_ids", new_ids )

print("\n" + "="*30)

items = [("a", 3), ("b", 1), ("c", 2)] 
ordered = [value for value in (sorted(items, key=lambda pair: pair[1]))]
print(ordered)

print("\n" + "="*30)

x = [1,2,3,4,5]
print(x[1:2])
print(x[-1])
print(x[-2:-1])
del x[2:4]
print(x)
x.pop(2)
print(x)
x.insert(3,4)
print(x)
x[1:2]=[99]
print(x)

print("\n" + "="*30)




from dataclasses import dataclass, asdict

PREMIUM_DISCOUNT = 0.10

@dataclass
class OrderLine:
    order_id: str
    customer_name: str
    product_name: str
    price: float
    discounted_price: float
    is_premium: bool

def parse_nested_order(data: dict) -> list[dict]:
    items = data.get("payload", {}).get("items", [])
    print(f"items in nested order", items)
    if not items:
        raise ValueError("Order has no items")
    customer = data.get("customer", {})
    name = customer.get("profile", {}).get("name", "")
    is_premium = customer.get("status") == "premium"
    rate = PREMIUM_DISCOUNT if is_premium else 0.0

    return [
        asdict(OrderLine(
            order_id = data["id"],
            customer_name= name,
            product_name = item["name"],
            price = item["price"],
            discounted_price= round(item["price"]*(1-rate), 2),
            is_premium = is_premium,
        ))
        for item in items
    ]


nested_order = {
    "id": "ord-5521",
    "customer": {
        "profile": {"name": "John Doe"},
        "status": "premium",
    },
    "payload": {
        "items": [
            {"name": "Mouse",    "price": 50},
            {"name": "Keyboard", "price": 100},
        ],
    },
}


# ── Call ───────────────────────────────────────
result = parse_nested_order(nested_order)

# ── Output ─────────────────────────────────────
for row in result:
    print(row)