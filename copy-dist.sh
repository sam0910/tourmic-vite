sudo cp -R /home/tourmic/tourmic-vite/dist/* /var/www/html
sudo chown -R www-data:www-data /var/www/html
sudo chmod -R 755 /var/www/html
sudo systemctl restart nginx