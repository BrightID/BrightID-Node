rm -rf ../brightid_2.0.0.zip
zip -r ../brightid_2.0.0.zip .
foxx uninstall /brightid
foxx install /brightid ../brightid_2.0.0.zip
