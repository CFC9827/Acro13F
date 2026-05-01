
def delete_range(filename, start, end):
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # start and end are 1-indexed line numbers
    del lines[start-1:end]
    
    with open(filename, 'w', encoding='utf-8') as f:
        f.writelines(lines)

delete_range(r"c:\Users\abram\Projects\Abrams13F\ui\src\components\GlobalDashboard.tsx", 1837, 2015)
