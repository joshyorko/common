# vim: set ft=make :
# These are recipes that are generic and should be available in bluefin and aurora

# TPM2 auto-unlock toggle
[group('System')]
toggle-tpm2:
    @/usr/bin/luks-tpm2-autounlock
