ssh -t andrea@raspberrypi.baida.dev \
    '
        if sudo systemctl is-active svg_templates.service; then \
            # Stop the server
            sudo systemctl stop svg_templates.service && echo "Server stopped"; \
        else \
            # Registering server for the first time
            sudo systemctl enable /home/andrea/apis/svg_templates/server/svg_templates.service && echo "Registering server for the first time"; \
        fi

        export PATH=$PATH:/snap/bin

        # Retrive changes from git
        cd ~/apis/svg_templates;
        git pull;
        cd server;
        /snap/bin/npm install;

        # Run the server
        sudo systemctl start svg_templates.service;
    '