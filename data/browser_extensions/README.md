## Put browser extensions here

e.g.:
```
wget -O /tmp/adblock.crx "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=112.0.5615.121&acceptformat=crx3,crx4&x=id%3Dcfhdojbkjhnklbpkdaibdccddilifddb%26uc"
wget -O /tmp/nocookie.crx "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=112.0.5615.121&acceptformat=crx3,crx4&x=id%3Dfihnjjcciajhdojfnbdddfaoknhalnja%26uc"

unzip /tmp/adblock.crx -d adblock
unzip /tmp/nocookie.crx -d nocookie
```

Those two are already configured in example settings, modify `browser_args` in your `settings.json` accordingly if you want to use different ones.
