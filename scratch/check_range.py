
def check_range(filename, start, end):
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    braces = 0
    parens = 0
    for i in range(start-1, end):
        for char in lines[i]:
            if char == '{': braces += 1
            elif char == '}': braces -= 1
            elif char == '(': parens += 1
            elif char == ')': parens -= 1
    
    print(f"Range {start}-{end} balance: braces={braces}, parens={parens}")

check_range(r"c:\Users\abram\Projects\Abrams13F\ui\src\components\GlobalDashboard.tsx", 2017, 2062)
check_range(r"c:\Users\abram\Projects\Abrams13F\ui\src\components\GlobalDashboard.tsx", 2065, 2162)
