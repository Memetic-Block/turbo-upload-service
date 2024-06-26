/**
 * Copyright (C) 2022-2023 Permanent Data Solutions, Inc. All Rights Reserved.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
import { ArweaveSigner, bundleAndSignData, createData } from "arbundles";
import Arweave from "arweave";
import axios from "axios";
import { expect } from "chai";
import { randomBytes } from "crypto";
import { describe } from "mocha";

import { ArweaveGateway } from "../src/arch/arweaveGateway";
import { ExponentialBackoffRetryStrategy } from "../src/arch/retryStrategy";
import { gatewayUrl } from "../src/constants";
import { TransactionId } from "../src/types/types";
import { jwkToPublicArweaveAddress } from "../src/utils/base64";
import {
  arweave,
  fundArLocalWalletAddress,
  mineArLocalBlock,
} from "./test_helpers";

describe("ArweaveGateway Class", function () {
  const gateway = new ArweaveGateway({
    endpoint: gatewayUrl,
    retryStrategy: new ExponentialBackoffRetryStrategy({
      maxRetriesPerRequest: 0,
    }),
  });
  let validDataItemId: TransactionId;
  let validAnchor: string;

  before(async () => {
    const jwk = await Arweave.crypto.generateJWK();
    await fundArLocalWalletAddress(arweave, jwkToPublicArweaveAddress(jwk));

    const signer = new ArweaveSigner(jwk);
    const dataItem = createData(randomBytes(10), signer);

    const bundle = await bundleAndSignData([dataItem], signer);

    validDataItemId = bundle.items[0].id;
    const tx = await bundle.toTransaction({}, arweave, jwk);
    validAnchor = tx.last_tx;
    await axios.post(`${gatewayUrl.origin}/tx`, tx);
    await mineArLocalBlock(arweave);
  });

  it("getDataItemsFromGQL can get blocks for valid data items from GQL", async () => {
    const result = await gateway.getDataItemsFromGQL([validDataItemId]);
    expect(result).to.have.lengthOf(1);
    expect(result[0]).to.have.property("id", validDataItemId);
    expect(result[0]).to.have.property("blockHeight");
  });

  it("getDataItemsFromGQL returns empty array for invalid data items", async () => {
    const result = await gateway.getDataItemsFromGQL(["invalid item"]);
    expect(result).to.have.lengthOf(0);
  });

  it("Given a valid txAnchor getBlockHeightForTxAnchor returns correct height", async () => {
    const result = await gateway.getBlockHeightForTxAnchor(validAnchor);

    expect(result).to.be.above(-1);
  });

  it("getCurrentBlockHeight returns a height", async () => {
    const result = await gateway.getCurrentBlockHeight();
    expect(result).to.be.above(0);
  });
});
