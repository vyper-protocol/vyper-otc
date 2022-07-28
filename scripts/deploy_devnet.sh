#!/bin/bash

# vyper otc
anchor deploy -p vyper-otc --provider.cluster d --provider.wallet ~/Dev/VyperWallets/vyper-program-authority/authority.json

# # # # # # # # # # # # # # # # # # 
# RECOVERY
# # # # # # # # # # # # # # # # # # 

# solana-keygen recover -o ./ephemeral-kp.json prompt:// 
# solana program deploy --buffer ./ephemeral-kp.json -u d --upgrade-authority ~/Dev/VyperWallets/vyper-program-authority/authority.json -k ~/Dev/VyperWallets/vyper-program-authority/authority.json ./target/deploy/vyper_otc.so
