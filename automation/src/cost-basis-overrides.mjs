function parseNumber(value) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
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

    const costValue = parseNumber(override.costValueEur);
    const performanceValue =
      costValue !== null && position.currentValue !== null
        ? position.currentValue - costValue
        : null;

    return {
      ...position,
      costValue,
      costValueQuote: parseNumber(override.costValueQuote),
      costCurrency: override.costCurrency ?? null,
      costBasisQuantity: parseNumber(override.quantityBasis),
      costBasisStatus: override.status ?? "UNVOLLSTAENDIG",
      costBasisNote: override.note ?? null,
      performanceValue,
      performancePct: costValue ? performanceValue / costValue : null,
    };
  });
}
