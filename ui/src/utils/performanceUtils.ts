/**
 * Robust Bisection solver for Internal Rate of Return (IRR).
 * Replaces Newton-Raphson which can be unstable for complex cash flow series.
 * 
 * @param cashFlows - An array of cash flows. First entry is typically negative (outflow).
 *                    Subsequent entries are intermediate flows (negative for outflow, positive for inflow).
 *                    Last entry should include the final terminal value (inflow).
 * @returns The quarterly IRR as a decimal (e.g., 0.05 for 5%).
 */
export const calculateIRR = (cashFlows: number[]): number => {
    if (cashFlows.length < 2) return 0;

    // Check if we have at least one positive and one negative flow
    const nonZeroCfs = cashFlows.filter(cf => cf !== 0);
    const hasPositive = nonZeroCfs.some(cf => cf > 0);
    const hasNegative = nonZeroCfs.some(cf => cf < 0);

    if (!hasPositive || !hasNegative) {
        return 0; // No solution possible without both signs
    }

    // Define search range for quarterly rate
    // -99.9% to 1000% per quarter
    let low = -0.9999;
    let high = 10.0;

    // Check signs at bounds
    const valueAtLow = computeNPV(cashFlows, low);
    const valueAtHigh = computeNPV(cashFlows, high);

    // If signs are same, root might not exist or be outside range.
    // However, usually NPV(-0.99) is huge positive, and NPV(10) is negative (for typical investment).
    // If both are positive, rate is > 1000%. If both negative, rate is < -99.9%.
    if (valueAtLow * valueAtHigh > 0) {
        // Fallback or clamp
        if (Math.abs(valueAtLow) < Math.abs(valueAtHigh)) return low;
        return 0;
    }

    // Bisection
    const epsilon = 1e-7;
    for (let i = 0; i < 100; i++) {
        const mid = (low + high) / 2;
        const npv = computeNPV(cashFlows, mid);

        if (Math.abs(npv) < 1e-9) return mid;

        // Assuming Decreasing NPV function (standard for investments):
        // NPV(Low) > 0, NPV(High) < 0
        // If NPV(Mid) > 0, Root is in [Mid, High] -> Low = Mid
        // If NPV(Mid) < 0, Root is in [Low, Mid] -> High = Mid

        // General sign check:
        if (valueAtLow * npv > 0) {
            low = mid;
        } else {
            high = mid;
        }

        if (Math.abs(high - low) < epsilon) {
            return (low + high) / 2;
        }
    }

    return (low + high) / 2;
};

const computeNPV = (cashFlows: number[], r: number): number => {
    let npv = 0;
    for (let t = 0; t < cashFlows.length; t++) {
        npv += cashFlows[t] / Math.pow(1 + r, t);
    }
    return npv;
};
