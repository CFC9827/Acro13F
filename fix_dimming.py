
import os

file_path = r"c:\Users\abram\.gemini\antigravity\scratch\Stock Screener\ui\src\components\MimicPerformanceChart.tsx"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# The target block to replace (we use a unique part of it)
target_start = "// DEFAULT: dimmed if it's context"
target_end = "if (val < 1.00) isDimmed = true;"

# We need to find the full block. Let's find start and a bit after
start_idx = content.find(target_start)
if start_idx == -1:
    print("Could not find start index")
    exit(1)

# Find the end of the block (which includes the '}' for the if statement likely)
# Actually, let's just replace the specific lines we know are there.
# The previous code:
# if (isSimulatorMode) {
#    // DEFAULT: dimmed if it's context
#    isDimmed = !!trade.isContext;
#    
#    // EXCEPTION: If it has significant User Value (> $1), UN-DIM it
#    // This makes "Rebalancing" trades visible
#    const val = Math.abs(trade.user_value ?? (trade.value * ratio0));
#    if (val > 1.00) {
#        isDimmed = false;
#    }
#
#    // Also dim if value is negligible (< $1)
#    if (!isDimmed && !isInitialSetup) {
#        if (val < 1.00) isDimmed = true;
#    }
# }

# We want to replace everything inside `if (isSimulatorMode) { ... }` 
# But that's hard to parse regex wise safely without counting braces.
# Let's try replacing the inner content.

old_inner = """// DEFAULT: dimmed if it's context
                                                        isDimmed = !!trade.isContext;
                                                        
                                                        // EXCEPTION: If it has significant User Value (> $1), UN-DIM it
                                                        // This makes "Rebalancing" trades visible
                                                        const val = Math.abs(trade.user_value ?? (trade.value * ratio0));
                                                        if (val > 1.00) {
                                                            isDimmed = false;
                                                        }

                                                        // Also dim if value is negligible (< $1)
                                                        if (!isDimmed && !isInitialSetup) {
                                                            if (val < 1.00) isDimmed = true;
                                                        }"""

new_inner = """// 1. Context rows are ALWAYS dimmed
                                                        isDimmed = !!trade.isContext;

                                                        // 2. Active rows are dimmed ONLY if they are insignificant (< $1)
                                                        if (!isDimmed && !isInitialSetup) {
                                                            const val = Math.abs(trade.user_value ?? (trade.value * ratio0));
                                                            if (val < 1.00) isDimmed = true;
                                                        }"""

# Try to find the old inner text. 
# Since we have whitespace issues, let's rely on splitting by lines and matching parts.

lines = content.split('\n')
new_lines = []
skip = False
for i, line in enumerate(lines):
    if "DEFAULT: dimmed if it's context" in line:
        # Found the start of the block to replace
        # We want to skip until we see the end of the block we want to replace
        # The end of the block we want to replace is the closing brace of the last if
        
        # Actually, let's just write the new logic here and skip the old lines
        new_lines.append(line.replace("// DEFAULT: dimmed if it's context", "// 1. Context rows are ALWAYS dimmed"))
        # Next line is isDimmed = !!trade.isContext; - keep it but valid
        # This approach is messy.
        pass
    
    # Simpler approach: Replace the known unique string chunk
    pass

# Let's try string replacement with looser whitespace matching
import re

# Construct regex for the block
pattern = r"// DEFAULT: dimmed if it's context.*?if \(val < 1\.00\) isDimmed = true;\s+}"
# That matches up to the closing brace of the inner if.

# Let's simply rewrite the file using the known unique start and assuming structure.
# We know the structure is:
# if (isSimulatorMode) {
#    <BLOCK>
# }

# Find "if (isSimulatorMode) {"
indices = [m.start() for m in re.finditer(r"if \(isSimulatorMode\) \{", content)]
# The one we want is likely the second one deep in the map function.
# The first one is likely earlier or valid.
# Let's look for the one containing "DEFAULT: dimmed"

valid_start = -1
for idx in indices:
    chunk = content[idx:idx+500]
    if "DEFAULT: dimmed" in chunk:
        valid_start = idx
        break

if valid_start == -1:
    print("Could not find the target block start.")
    exit(1)

# Find the matching closing brace for the if block
# We can just cheat and find the next occurence of certain code that follows it.
# e.g. "const isHighlighted"
end_idx = content.find("const isHighlighted", valid_start)
if end_idx == -1:
    print("Could not find end index")
    exit(1)

# The block to replace is from valid_start to end_idx (exclusive of isHighlighted line, inclusive of closing brace)
# The closing brace is just before isHighlighted.
# Let's verify by looking at the content just before end_idx
pre_content = content[valid_start:end_idx]
last_brace = pre_content.rfind('}')
full_replace_range = (valid_start, valid_start + last_brace + 1)

new_block = """if (isSimulatorMode) {
                                                        // 1. Context rows are ALWAYS dimmed
                                                        isDimmed = !!trade.isContext;

                                                        // 2. Active rows are dimmed ONLY if they are insignificant (< $1)
                                                        if (!isDimmed && !isInitialSetup) {
                                                            const val = Math.abs(trade.user_value ?? (trade.value * ratio0));
                                                            if (val < 1.00) isDimmed = true;
                                                        }
                                                    }"""

# indent logic
indent = "                                                    " # 52 spaces based on view_file
# The new_block is already indented in string, but let's be careful.
# Actually the replacement string above has indent in it.

final_content = content[:valid_start] + new_block + "\n\n" + (" " * 52) + content[end_idx:] 
# Added formatting space.

# Let's just output the new content
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(final_content)

print("Successfully replaced logic.")
