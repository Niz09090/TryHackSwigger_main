FROM ubuntu:22.04

# Install required packages
RUN apt-get update && apt-get install -y \
    gcc \
    gdb \
    gdbserver \
    python3 \
    python3-pip \
    curl \
    ttyd \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install pwndbg
RUN cd /opt && \
    git clone https://github.com/pwndbg/pwndbg && \
    cd pwndbg && \
    ./setup.sh

# Copy vulnerable program
COPY vulnerable.c /tmp/vulnerable.c

# Compile with no stack protection
RUN gcc -fno-stack-protector -no-pie -z execstack -o /vulnerable /tmp/vulnerable.c
RUN rm /tmp/vulnerable.c

# Create flag
RUN echo 'hackforge{bof_exploit_success}' > /root/flag.txt
RUN chmod 600 /root/flag.txt

# Add decoy flags
RUN echo 'hackforge{fake_bof_flag}' > /tmp/decoy.txt
RUN mkdir -p /home/user && echo 'hackforge{not_real_flag}' > /home/user/.secret

# Expose ttyd port
EXPOSE 7681

# Start ttyd
CMD ttyd -p 7681 bash
