rm -rf ../brightid_3.0.0.zip
zip -r ../brightid_3.0.0.zip .
foxx uninstall /brightid
foxx install /brightid ../brightid_3.0.0.zip
