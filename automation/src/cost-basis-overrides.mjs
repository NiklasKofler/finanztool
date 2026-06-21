function parseNumber(value) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMoney(value) {
  return typeof value === "number" ? Math.round(value * 100) / 100 : value;
}

function costAllocationFactor(position, override) {
  const currentQuantity = parseNumber(position.quantity);
  const basisQuantity = parseNumber(override.quantityBasis);
  if (
    currentQuantity === null ||
    basisQuantity === null ||
    currentQuantity <= 0 ||
    basisQuantity <= 0 ||
    currentQuantity >= basisQuantity
  ) {
    return 1;
  }

  return currentQuantity / basisQuantity;
}

export function applyCostBasisOverrides(positions, overrides) {
  const overridesByPosition = new Map(
    (overrides ?? [])
      .filter((override) => override.positionId)
      .map((override) => [override.positionId, override]),
  );

  return (positions ?? []).map((position) => {
    const override = overridesByPosition.get(position.id);
    if (!override) return position;

    const allocationFactor = costAllocationFactor(position, override);
    const rawCostValue = parseNumber(override.costValueEur);
    const rawCostValueQuote = parseNumber(override.costValueQuote);
    const costValue = rawCostValue !== null ? roundMoney(rawCostValue * allocationFactor) : null;
    const costValueQuote =
      rawCostValueQuote !== null ? roundMoney(rawCostValueQuote * allocationFactor) : null;
    const performanceValue =
      costValue !== null && position.currentValue !== null
        ? roundMoney(position.currentValue - costValue)
        : null;

    return {
      ...position,
      costValue,
      costValueQuote,
      costCurrency: override.costCurrency ?? null,
      costBasisQuantity: parseNumber(override.quantityBasis),
      costBasisAppliedQuantity: parseNumber(position.quantity),
      costBasisOriginalValueEur: rawCostValue,
      costBasisOriginalValueQuote: rawCostValueQuote,
      costBasisAllocationFactor: allocationFactor,
      costBasisProrated: allocationFactor !== 1,
      costBasisStatus: override.status ?? "UNVOLLSTAENDIG",
      costBasisNote: override.note ?? null,
      performanceValue,
      performancePct: costValue ? performanceValue / costValue : null,
    };
  });
}
