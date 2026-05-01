
def check_balance(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    braces = 0
    parens = 0
    
    lines = content.split('\n')
    for i, line in enumerate(lines):
        for char in line:
            if char == '{':
                braces += 1
            elif char == '}':
                braces -= 1
            elif char == '(':
                parens += 1
            elif char == ')':
                parens -= 1
                
        if braces < 0:
            print(f"Line {i+1}: Unbalanced }} (braces={braces})")
            # We can't just stop because it might be a temporary imbalance in a string or something
            # but usually in TSX it's a real error.
        if parens < 0:
            print(f"Line {i+1}: Unbalanced ) (parens={parens})")

    print(f"Final balance: braces={braces}, parens={parens}")

check_balance(r"c:\Users\abram\Projects\Abrams13F\ui\src\components\GlobalDashboard.tsx")
