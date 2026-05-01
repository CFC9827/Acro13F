
def replace_lines(filename, start, end, new_lines):
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # start and end are 1-indexed line numbers
    lines[start-1:end] = [line + '\n' for line in new_lines.split('\n')]
    
    with open(filename, 'w', encoding='utf-8') as f:
        f.writelines(lines)

new_content = """                            {/* New Positions Spotlight */}
                            {newPositions.length > 0 && (
                                <section className="dashboard-section compact">
                                    <div className="section-header">
                                        <PlusCircle className="section-icon-small" style={{ color: '#10b981' }} />
                                        <div>
                                            <h3 className="section-title-small">New This Quarter</h3>
                                            <p className="section-desc-small">New positions and re-entries</p>
                                        </div>
                                        <div className="toggle-group">
                                            <button
                                                className={`toggle-btn ${newPosSort === 'value' ? 'active' : ''}`}
                                                onClick={() => setNewPosSort('value')}
                                                title="Sort by dollar value"
                                            >$</button>
                                            <button
                                                className={`toggle-btn ${newPosSort === 'weight' ? 'active' : ''}`}
                                                onClick={() => setNewPosSort('weight')}
                                                title="Sort by portfolio %"
                                            >%</button>
                                        </div>
                                    </div>"""

replace_lines(r"c:\Users\abram\Projects\Abrams13F\ui\src\components\GlobalDashboard.tsx", 1837, 1842, new_content)
