rm -rf ../brightid_1.0.0.zip
zip -r ../brightid_1.0.0.zip .
foxx uninstall /brightid
foxx install /brightid ../brightid_1.0.0.zip
