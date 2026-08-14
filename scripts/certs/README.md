# Sertifikati

`sectigo-intermediate.pem` je intermediate sertifikat za `openapi.apr.gov.rs`.

APR server šalje samo leaf sertifikat (`CN=*.apr.gov.rs`) i ne šalje intermediate,
pa Node puca sa `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. `curl` prolazi zato što sam
dovlači intermediate preko AIA ekstenzije; Node to ne radi.

Izvor:
`http://crt.sectigo.com/SSL2BUYEMEARSADomainValidationSecureServerCA.crt`

Konverzija iz DER u PEM:

    openssl x509 -inform DER -in sectigo.crt -out sectigo-intermediate.pem

Koren lanca (`Sectigo Public Server Authentication Root R46`) već postoji u Node-ovom
ugrađenom spisku, pa se dodaje samo ovaj jedan sertifikat.

Ako sertifikat istekne, ingest pada sa jasnom TLS porukom. Tada se skida novi sa iste
adrese. **Nikad se ne rešava sa `rejectUnauthorized: false`.**
