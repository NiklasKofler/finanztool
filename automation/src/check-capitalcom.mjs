import "dotenv/config";
import { createCapitalComClientFromLocalSecrets, fetchCapitalComPortfolioSnapshot } from "./capitalcom-client.mjs";

const client = await createCapitalComClientFromLocalSecrets();
const snapshot = await fetchCapitalComPortfolioSnapshot(client);

console.log(
  JSON.stringify(
    {
      source: "capitalcom",
      demo: snapshot.demo,
      accountId: snapshot.accountId,
      currentValue: snapshot.currentValue,
      cashValue: snapshot.cashValue,
      positionCount: snapshot.positionCount,
      accounts: snapshot.accounts,
      nonEurAccountCount: snapshot.nonEurAccountCount,
      status: snapshot.status,
    },
    null,
    2,
  ),
);
