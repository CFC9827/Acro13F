
def debug_chars(filename, start, end):
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    braces = 0
    parens = 0
    for i in range(start-1, end):
        line = lines[i]
        for char in line:
            if char == '{': 
                braces += 1
                print(f"L{i+1}: {{ (total={braces})")
            elif char == '}': 
                braces -= 1
                print(f"L{i+1}: }} (total={braces})")
            elif char == '(': 
                parens += 1
                print(f"L{i+1}: ( (total={parens})")
            elif char == ')': 
                parens -= 1
                print(f"L{i+1}: ) (total={parens})")

debug_chars(r"c:\Users\abram\Projects\Abrams13F\ui\src\components\GlobalDashboard.tsx", 2001, 2062)
